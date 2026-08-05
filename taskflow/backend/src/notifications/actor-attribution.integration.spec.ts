import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TasksController } from '../tasks/tasks.controller';
import { TasksService } from '../tasks/tasks.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { CommentsService } from '../comments/comments.service';
import { CommentsRepository } from '../comments/comments.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { UsersService } from '../users/users.service';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { NotificationListener } from './listeners/notification.listener';
import { NotificationsRepository } from './notifications.repository';
import { NotificationType } from './schemas/notification.schema';
import { TaskStatus } from '../tasks/schemas/task.schema';
import { UserRole } from '../users/schemas/user.schema';

/**
 * Integration test — the full actor-attribution chain:
 *
 *   authenticated actor → TasksController → TasksService → typed domain
 *   event → NotificationListener → NotificationsRepository
 *
 * The REAL EventEmitterModule, TasksService, CommentsService and
 * NotificationListener are wired together; only the data-access layer is
 * mocked (the same seams production injects). Proves human-triggered task
 * events persist a real sender, recipients stay the task assignee,
 * self-notifications are still prevented, and only cron-generated
 * deadline-urgent alerts are senderless.
 */
describe('Actor attribution — integration (controller → service → event → listener)', () => {
  let controller: TasksController;
  let tasksService: TasksService;
  let commentsService: CommentsService;
  let tasksRepository: {
    findById: jest.Mock;
    update: jest.Mock;
    markDeadlineUrgentNotified: jest.Mock;
  };
  let projectsRepository: { findById: jest.Mock };
  let commentsRepository: { findById: jest.Mock; create: jest.Mock };
  let createMock: jest.Mock;

  // Valid 24-char hex ObjectIds (BSONError otherwise when the services cast).
  const TASK_ID = '507f1f77bcf86cd799439011';
  const ASSIGNEE_1 = '507f1f77bcf86cd799439012';
  const ASSIGNEE_2 = '507f1f77bcf86cd799439013';
  const ACTOR_ID = '507f1f77bcf86cd799439014';
  const USER_A = '507f1f77bcf86cd799439015';
  const USER_B = '507f1f77bcf86cd799439016';
  const REPLY_TO_ID = '507f1f77bcf86cd799439017';

  // The authenticated actor bound by @CurrentUser() (a UserDocument shape).
  const actor = {
    _id: { toString: () => ACTOR_ID },
    role: UserRole.PROJECT_MANAGER,
  };

  const taskWithAssignee = (assigneeId: string) => ({
    _id: { toString: () => TASK_ID },
    title: 'Build API',
    status: TaskStatus.TODO,
    // Far-future due date — never inside the 24h urgent window.
    dueDate: new Date('2030-01-01'),
    project: { toString: () => 'project-1' },
    assigneeId,
    toObject: () => ({ _id: TASK_ID, title: 'Build API' }),
  });

  beforeEach(async () => {
    tasksRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      markDeadlineUrgentNotified: jest.fn(),
    };
    projectsRepository = { findById: jest.fn() };
    commentsRepository = { findById: jest.fn(), create: jest.fn() };
    createMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [TasksController],
      providers: [
        TasksService,
        CommentsService,
        NotificationListener,
        { provide: TasksRepository, useValue: tasksRepository },
        { provide: ProjectsRepository, useValue: projectsRepository },
        { provide: UsersService, useValue: { findById: jest.fn() } },
        { provide: CommentsRepository, useValue: commentsRepository },
        { provide: NotificationsRepository, useValue: { create: createMock } },
        // Real policy over the mocked projects repository — the visibility
        // seam itself is not under test here.
        VisibilityPolicyService,
      ],
    }).compile();
    // Lifecycle hooks register the @OnEvent subscribers with the emitter.
    await module.init();

    controller = module.get(TasksController);
    tasksService = module.get(TasksService);
    commentsService = module.get(CommentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('task reassignment (authenticated actor)', () => {
    it('persists the actor as sender; the recipient stays the new assignee', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(ASSIGNEE_1));
      projectsRepository.findById.mockResolvedValue({
        ownerId: 'owner-1',
        memberIds: [ASSIGNEE_2],
      });
      tasksRepository.update.mockResolvedValue(taskWithAssignee(ASSIGNEE_2));

      await controller.update(TASK_ID, { assignee: ASSIGNEE_2 }, actor);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: ASSIGNEE_2,
          sender: ACTOR_ID,
          type: NotificationType.TASK_ASSIGNED,
          task: TASK_ID,
        }),
      );
    });
  });

  describe('status change (authenticated actor)', () => {
    it('persists the actor as sender; the recipient stays the task assignee', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(ASSIGNEE_1));
      tasksRepository.update.mockResolvedValue(taskWithAssignee(ASSIGNEE_1));

      await controller.updateStatus(
        TASK_ID,
        { status: TaskStatus.IN_PROGRESS },
        actor,
      );

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: ASSIGNEE_1,
          sender: ACTOR_ID,
          type: NotificationType.STATUS_CHANGED,
          task: TASK_ID,
        }),
      );
    });
  });

  describe('deadline-urgent (cron-generated)', () => {
    it('remains senderless — the only intentional case', async () => {
      // The cron calls the single source of truth for the urgent alert.
      await tasksService.notifyUrgentDeadlineIfDue(
        TASK_ID,
        'Build API',
        ASSIGNEE_1,
        TaskStatus.TODO,
        new Date(Date.now() + 5 * 60 * 60 * 1000),
      );

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: ASSIGNEE_1,
          type: NotificationType.DEADLINE_URGENT,
          task: TASK_ID,
        }),
      );
      // The cron-generated alert carries no sender at all.
      const urgentCall = createMock.mock.calls[0] as unknown as [
        { sender?: string },
      ];
      expect(urgentCall[0].sender).toBeUndefined();
      expect(tasksRepository.markDeadlineUrgentNotified).toHaveBeenCalledWith(
        TASK_ID,
      );
    });
  });

  describe('self-notification prevention (comment flow)', () => {
    const commentDoc = {
      _id: { toString: () => 'comment-1' },
      toObject: () => ({ _id: 'comment-1', content: 'hi' }),
    };

    it('does not notify when the commenter is the task assignee', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(USER_A));
      commentsRepository.create.mockResolvedValue(commentDoc);

      await commentsService.create({ content: 'hi' }, TASK_ID, USER_A);

      expect(createMock).not.toHaveBeenCalled();
    });

    it('notifies the assignee with the commenter as sender otherwise', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(USER_B));
      commentsRepository.create.mockResolvedValue(commentDoc);

      await commentsService.create({ content: 'hi' }, TASK_ID, USER_A);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: USER_B,
          sender: USER_A,
          type: NotificationType.COMMENT,
          task: TASK_ID,
          comment: 'comment-1',
        }),
      );
    });

    it('does not notify the parent author when replying to your own comment', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(USER_B));
      commentsRepository.findById.mockResolvedValue({
        task: { toString: () => TASK_ID },
        authorId: USER_A,
      });
      commentsRepository.create.mockResolvedValue(commentDoc);

      // USER_A replies to USER_A's own comment → parent-author self-skip;
      // the task assignee (USER_B) is still notified.
      await commentsService.create(
        { content: 'hi', replyTo: REPLY_TO_ID },
        TASK_ID,
        USER_A,
      );

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: USER_B,
          sender: USER_A,
          type: NotificationType.COMMENT,
        }),
      );
    });
  });
});
