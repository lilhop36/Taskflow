import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationListener } from './notification.listener';
import { NotificationsRepository } from '../notifications.repository';
import { NotificationType } from '../schemas/notification.schema';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskStatusChangedEvent } from '../events/task-status-changed.event';
import { TaskDeadlineUrgentEvent } from '../events/task-deadline-urgent.event';
import { CommentCreatedEvent } from '../events/comment-created.event';

/**
 * Unit Tests — NotificationListener
 *
 * SRS: FR-008.1-3 — event-driven alerts.
 * Verifies each domain event creates the correct notification type,
 * including COMMENT for new task comments (FR-007).
 */
describe('NotificationListener', () => {
  let listener: NotificationListener;
  let repository: jest.Mocked<NotificationsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationListener,
        {
          provide: NotificationsRepository,
          useValue: { create: jest.fn() },
        },
      ],
    }).compile();

    listener = module.get(NotificationListener);
    repository = module.get(NotificationsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleTaskAssigned() — FR-008.1', () => {
    it('should create a TASK_ASSIGNED notification', async () => {
      await listener.handleTaskAssigned({
        taskId: 'task-1',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        assignedBy: 'pm-1',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          type: NotificationType.TASK_ASSIGNED,
          task: 'task-1',
          // The typed contract carries the assigner as the sender
          sender: 'pm-1',
        }),
      );
    });
  });

  // NOTE: there is no "senderless" test for task.assigned / task.status-changed
  // — both events now REQUIRE an actor (assignedBy/changedBy), so a
  // task notification without a sender is a compile error, not a runtime case.
  // Only TaskDeadlineUrgentEvent (cron-generated) is senderless; see below.

  describe('handleTaskStatusChanged() — FR-008.2', () => {
    it('should create a STATUS_CHANGED notification', async () => {
      await listener.handleTaskStatusChanged({
        taskId: 'task-1',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        oldStatus: 'To Do',
        newStatus: 'In Progress',
        changedBy: 'user-1',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          type: NotificationType.STATUS_CHANGED,
          task: 'task-1',
          // The typed contract carries the status changer as the sender
          sender: 'user-1',
        }),
      );
    });
  });

  describe('handleTaskDeadlineUrgent() — FR-008.3', () => {
    it('should create a DEADLINE_URGENT notification', async () => {
      await listener.handleTaskDeadlineUrgent({
        taskId: 'task-1',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        dueDate: new Date(),
        hoursRemaining: 5,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          type: NotificationType.DEADLINE_URGENT,
          task: 'task-1',
        }),
      );
      // Deadline-urgent is cron-generated — always senderless.
      expect(repository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ sender: expect.anything() }),
      );
    });
  });

  describe('real EventEmitter wiring — the event seam', () => {
    // Proves the @OnEvent(Class.eventName) decorators are bound to the exact
    // keys the services emit, so a renamed/misspelled event key would be
    // caught by a compile error on Class.eventName rather than a silent drop.
    let emitter: EventEmitter2;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          NotificationListener,
          { provide: NotificationsRepository, useValue: { create: jest.fn() } },
        ],
      }).compile();
      // Lifecycle hooks register the @OnEvent subscribers with the emitter.
      await module.init();

      listener = module.get(NotificationListener);
      repository = module.get(NotificationsRepository);
      emitter = module.get(EventEmitter2);
    });

    it('delivers a constructed TaskAssignedEvent under its eventName', async () => {
      await emitter.emitAsync(
        TaskAssignedEvent.eventName,
        new TaskAssignedEvent('task-1', 'user-1', 'Build API', 'pm-1'),
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'user-1' }),
      );
    });

    it('delivers a constructed TaskStatusChangedEvent under its eventName', async () => {
      await emitter.emitAsync(
        TaskStatusChangedEvent.eventName,
        new TaskStatusChangedEvent(
          'task-1',
          'user-1',
          'Build API',
          'To Do',
          'In Progress',
          'user-1',
        ),
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.STATUS_CHANGED }),
      );
    });

    it('delivers a constructed TaskDeadlineUrgentEvent under its eventName', async () => {
      await emitter.emitAsync(
        TaskDeadlineUrgentEvent.eventName,
        new TaskDeadlineUrgentEvent(
          'task-1',
          'Build API',
          'user-1',
          new Date(),
          5,
        ),
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.DEADLINE_URGENT }),
      );
    });

    it('delivers a constructed CommentCreatedEvent (reply) under its eventName', async () => {
      await emitter.emitAsync(
        CommentCreatedEvent.eventName,
        new CommentCreatedEvent(
          'task-1',
          'comment-2',
          'user-a',
          'user-1',
          'Build API',
          'Liya Tesfaye',
          'comment-1',
          'user-b',
        ),
      );

      expect(repository.create).toHaveBeenCalledTimes(2); // assignee + parent author
    });

    it('does not fire when the emitted key does not match any listener (typo protection)', async () => {
      await emitter.emitAsync('task.assgined', {
        taskId: 'task-1',
        assigneeId: 'user-1',
      });

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('handleCommentCreated() — FR-007 threaded comments', () => {
    it('should create a COMMENT notification for the task assignee, naming the commenter', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-1',
        authorId: 'user-a',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        authorName: 'Hanna Girma',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          type: NotificationType.COMMENT,
          task: 'task-1',
          comment: 'comment-1',
          // The typed contract carries the commenter as the sender
          sender: 'user-a',
          message: expect.stringContaining('Hanna Girma commented'),
        }),
      );
    });

    it('should fall back to a generic "Someone" message for the assignee alert when the name is unknown', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-1',
        authorId: 'user-a',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          message: expect.stringContaining('Someone commented'),
        }),
      );
    });

    it('should skip self-notifications (author === assignee)', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-1',
        authorId: 'user-1',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
      });

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should do nothing when the task has no assignee and it is not a reply', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-1',
        authorId: 'user-a',
        assigneeId: undefined,
        taskTitle: 'Build API',
      });

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should notify the original comment author when a reply is added', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-2',
        authorId: 'user-a',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        authorName: 'Liya Tesfaye',
        replyTo: 'comment-1',
        parentAuthorId: 'user-b',
      });

      // Assignee (user-1) AND parent comment author (user-b) both notified
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-1',
          type: NotificationType.COMMENT,
          comment: 'comment-2',
        }),
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-b',
          message: expect.stringContaining('Liya Tesfaye replied'),
          type: NotificationType.COMMENT,
          comment: 'comment-2',
        }),
      );
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('should fall back to a generic "Someone" message when the replier name is unknown', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-2',
        authorId: 'user-a',
        assigneeId: undefined,
        taskTitle: 'Build API',
        replyTo: 'comment-1',
        parentAuthorId: 'user-b',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-b',
          message: expect.stringContaining('Someone replied'),
        }),
      );
    });

    it('should not notify the parent author when replying to your own comment', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-2',
        authorId: 'user-b',
        assigneeId: 'user-1',
        taskTitle: 'Build API',
        replyTo: 'comment-1',
        parentAuthorId: 'user-b',
      });

      // Assignee notified, parent author === replier → no self-notification
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'user-1' }),
      );
      expect(repository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'user-b' }),
      );
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('should dedupe when the assignee is also the parent comment author', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-2',
        authorId: 'user-a',
        assigneeId: 'user-b',
        taskTitle: 'Build API',
        authorName: 'Hanna Girma',
        replyTo: 'comment-1',
        parentAuthorId: 'user-b',
      });

      // user-b fills both roles — a single notification, with the more
      // specific reply message winning
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'user-b',
          message: expect.stringContaining('Hanna Girma replied'),
        }),
      );
    });

    it('should notify the parent author even when the task has no assignee', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-2',
        authorId: 'user-a',
        assigneeId: undefined,
        taskTitle: 'Build API',
        replyTo: 'comment-1',
        parentAuthorId: 'user-b',
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'user-b' }),
      );
    });
  });
});
