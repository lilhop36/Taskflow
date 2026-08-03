import { Test, TestingModule } from '@nestjs/testing';
import { NotificationListener } from './notification.listener';
import { NotificationsRepository } from '../notifications.repository';
import { NotificationType } from '../schemas/notification.schema';

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
        }),
      );
    });
  });

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
    });
  });

  describe('handleCommentCreated() — FR-007', () => {
    it('should create a COMMENT notification for the task assignee', async () => {
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
          type: NotificationType.COMMENT,
          task: 'task-1',
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

    it('should do nothing when the task has no assignee', async () => {
      await listener.handleCommentCreated({
        taskId: 'task-1',
        commentId: 'comment-1',
        authorId: 'user-a',
        assigneeId: undefined,
        taskTitle: 'Build API',
      });

      expect(repository.create).not.toHaveBeenCalled();
    });
  });
});
