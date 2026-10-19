import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { TaskStatus, TaskPriority } from './schemas/task.schema';
import { TaskAssignedEvent } from '../notifications/events/task-assigned.event';
import { TaskStatusChangedEvent } from '../notifications/events/task-status-changed.event';
import { TaskDeadlineUrgentEvent } from '../notifications/events/task-deadline-urgent.event';

/**
 * Unit Tests — TasksService
 *
 * SRS: FR-004 (Task Management), BR-002 (Task Status FSM), BR-005 (Membership)
 *
 * Strategy:
 * - All repositories, UsersService, and EventEmitter2 are mocked.
 * - We test that the service enforces business rules BEFORE hitting the DB.
 */
describe('TasksService', () => {
  let service: TasksService;
  let tasksRepository: jest.Mocked<TasksRepository>;
  let projectsRepository: jest.Mocked<ProjectsRepository>;
  let usersService: jest.Mocked<UsersService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockTask = {
    _id: { toString: () => 'task-id-123' },
    title: 'Implement login',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: new Date('2024-06-01'),
    project: { toString: () => 'project-id-123' },
    assigneeId: 'member-id',
    toObject: () => ({
      _id: 'task-id-123',
      title: 'Implement login',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    }),
  } as any;

  // Shared repository mock — the real VisibilityPolicyService is wired on
  // top of it so the BR-001/BR-003 read decisions are exercised, not
  // mocked away (the existing assertions on findIdsForMember /
  // isUserMemberOfProject keep proving the underlying queries).
  const projectsRepositoryMock = {
    findById: jest.fn(),
    findIdsForMember: jest.fn(),
    isUserMemberOfProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: TasksRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            findByProject: jest.fn(),
            findByProjectIds: jest.fn(),
            findByAssignee: jest.fn(),
            findByAssigneeInProjects: jest.fn(),
            update: jest.fn(),
            findDueWithin: jest.fn(),
            markDeadlineUrgentNotified: jest.fn(),
          },
        },
        {
          provide: ProjectsRepository,
          useValue: projectsRepositoryMock,
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: VisibilityPolicyService,
          useValue: new VisibilityPolicyService(
            projectsRepositoryMock as unknown as ProjectsRepository,
          ),
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    tasksRepository = module.get(TasksRepository);
    projectsRepository = module.get(ProjectsRepository);
    usersService = module.get(UsersService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    // Valid ObjectId hex strings (BSONError otherwise when casting in the service)
    const MEMBER_ID = '507f1f77bcf86cd799439012';
    const OWNER_ID = '507f1f77bcf86cd799439013';
    const PROJECT_ID = '507f1f77bcf86cd799439014';

    const mockProject = {
      _id: { toString: () => PROJECT_ID },
      name: 'TaskFlow MVP',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      ownerId: OWNER_ID,
      memberIds: [MEMBER_ID],
    } as any;

    const mockUser = {
      _id: { toString: () => MEMBER_ID },
      email: 'member@example.com',
    } as any;

    const createDto = {
      title: 'Implement login',
      description: 'Build the auth flow',
      priority: TaskPriority.HIGH,
      dueDate: '2024-06-01',
      project: PROJECT_ID,
      assignee: MEMBER_ID,
    };

    it('should create a task and emit task.assigned event (FR-004.1, FR-008.1)', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.create.mockResolvedValue(mockTask);

      const result = await service.create(createDto, OWNER_ID);

      expect(tasksRepository.create).toHaveBeenCalled();
      // The typed event contract: emitted under the shared eventName key with
      // a constructed TaskAssignedEvent payload.
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskAssignedEvent.eventName,
        expect.any(TaskAssignedEvent),
      );
      const emitted = eventEmitter.emit.mock.calls[0][1] as TaskAssignedEvent;
      expect(emitted.assigneeId).toBe(MEMBER_ID);
      expect(emitted.assignedBy).toBe(OWNER_ID);
      expect(result).toBeDefined();
    });

    it('should emit task.deadline-urgent and mark notified when due within 24h (FR-008.3)', async () => {
      const urgentTask = {
        ...mockTask,
        dueDate: new Date(Date.now() + 5 * 60 * 60 * 1000),
        assigneeId: MEMBER_ID,
      };
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.create.mockResolvedValue(urgentTask);

      await service.create(createDto, OWNER_ID);

      // task.assigned fires first; find the deadline-urgent call by its key.
      const urgentCall = eventEmitter.emit.mock.calls.find(
        ([name]) => name === TaskDeadlineUrgentEvent.eventName,
      )!;
      expect(urgentCall[1]).toBeInstanceOf(TaskDeadlineUrgentEvent);
      const emitted = urgentCall[1] as TaskDeadlineUrgentEvent;
      expect(emitted.taskId).toBe('task-id-123');
      expect(emitted.assigneeId).toBe(MEMBER_ID);
      expect(emitted.hoursRemaining).toBeGreaterThan(0);
      expect(tasksRepository.markDeadlineUrgentNotified).toHaveBeenCalledWith(
        'task-id-123',
      );
    });

    it('should NOT emit task.deadline-urgent when the task is already Done', async () => {
      const doneTask = {
        ...mockTask,
        status: TaskStatus.DONE,
        dueDate: new Date(Date.now() + 5 * 60 * 60 * 1000),
      };
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.create.mockResolvedValue(doneTask);

      await service.create(createDto, OWNER_ID);

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        TaskDeadlineUrgentEvent.eventName,
        expect.anything(),
      );
      expect(tasksRepository.markDeadlineUrgentNotified).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectsRepository.findById.mockResolvedValue(null);

      await expect(service.create(createDto, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when assignee is not a project member (BR-005)', async () => {
      const nonMemberProject = {
        ...mockProject,
        memberIds: [], // No members — only the owner
        ownerId: OWNER_ID,
      };
      projectsRepository.findById.mockResolvedValue(nonMemberProject);
      usersService.findById.mockResolvedValue(mockUser);

      const dtoWithNonMember = {
        ...createDto,
        assignee: '507f1f77bcf86cd799439099',
      };

      await expect(service.create(dtoWithNonMember, OWNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when due date is outside project bounds', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);

      const dtoWithBadDate = { ...createDto, dueDate: '2025-06-01' }; // After endDate 2024-12-31

      await expect(service.create(dtoWithBadDate, OWNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── updateStatus() — Status FSM (BR-002) ────────────────────────────────

  describe('updateStatus()', () => {
    // The authenticated actor performing the transition (required param)
    const ACTOR_ID = '507f1f77bcf86cd799439016';

    it('should allow TODO → IN_PROGRESS (BR-002)', async () => {
      const todoTask = {
        ...mockTask,
        status: TaskStatus.TODO,
        toObject: () => ({ status: TaskStatus.IN_PROGRESS }),
      };
      tasksRepository.findById.mockResolvedValue(todoTask);
      tasksRepository.update.mockResolvedValue(todoTask);

      await expect(
        service.updateStatus(
          'task-id-123',
          { status: TaskStatus.IN_PROGRESS },
          ACTOR_ID,
        ),
      ).resolves.not.toThrow();
    });

    it('should reject TODO → DONE (BR-002 — invalid FSM transition)', async () => {
      const todoTask = { ...mockTask, status: TaskStatus.TODO };
      tasksRepository.findById.mockResolvedValue(todoTask);

      await expect(
        service.updateStatus(
          'task-id-123',
          { status: TaskStatus.DONE },
          ACTOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit task.status-changed event on valid transition (FR-008.2)', async () => {
      const inProgressTask = {
        ...mockTask,
        status: TaskStatus.IN_PROGRESS,
        assigneeId: 'member-id',
        toObject: () => ({ status: TaskStatus.DONE }),
      };
      tasksRepository.findById.mockResolvedValue(inProgressTask);
      tasksRepository.update.mockResolvedValue(inProgressTask);

      await service.updateStatus(
        'task-id-123',
        { status: TaskStatus.DONE },
        ACTOR_ID,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskStatusChangedEvent.eventName,
        expect.any(TaskStatusChangedEvent),
      );
      const emitted = eventEmitter.emit.mock
        .calls[0][1] as TaskStatusChangedEvent;
      expect(emitted.newStatus).toBe(TaskStatus.DONE);
      // The authenticated actor is the sender — real user id, not a
      // sentinel.
      expect(emitted.changedBy).toBe(ACTOR_ID);
    });

    it('should clear deadlineUrgentNotifiedAt when a Done task is reopened (FR-008.3)', async () => {
      const doneTask = {
        ...mockTask,
        status: TaskStatus.DONE,
        assigneeId: 'member-id',
        toObject: () => ({ status: TaskStatus.IN_PROGRESS }),
      };
      tasksRepository.findById.mockResolvedValue(doneTask);
      tasksRepository.update.mockResolvedValue(doneTask);

      await service.updateStatus(
        'task-id-123',
        {
          status: TaskStatus.IN_PROGRESS,
        },
        ACTOR_ID,
      );

      expect(tasksRepository.update).toHaveBeenCalledWith(
        'task-id-123',
        expect.objectContaining({ deadlineUrgentNotifiedAt: null }),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          'non-existent',
          {
            status: TaskStatus.IN_PROGRESS,
          },
          ACTOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update() — Reassignment notifications (FR-008.1) ──────────────────────

  describe('update()', () => {
    // Valid ObjectId hex strings (BSONError otherwise when casting in the service)
    const TASK_ID = '507f1f77bcf86cd799439011';
    const MEMBER_ID = '507f1f77bcf86cd799439012';
    const OWNER_ID = '507f1f77bcf86cd799439013';
    const PROJECT_ID = '507f1f77bcf86cd799439014';
    // The authenticated actor performing the update (required param)
    const ACTOR_ID = '507f1f77bcf86cd799439018';

    const project = {
      _id: { toString: () => PROJECT_ID },
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      ownerId: OWNER_ID,
      memberIds: [MEMBER_ID],
    } as any;

    const taskWithAssignee = (assigneeId: string) =>
      ({
        _id: { toString: () => TASK_ID },
        title: 'Implement login',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2024-06-01'),
        project: { toString: () => PROJECT_ID },
        assigneeId,
        toObject: () => ({ _id: TASK_ID, title: 'Implement login' }),
      }) as any;

    it('should emit task.assigned when the assignee changes (FR-008.1)', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      projectsRepository.findById.mockResolvedValue(project);
      tasksRepository.update.mockResolvedValue(taskWithAssignee(OWNER_ID));

      await service.update(TASK_ID, { assignee: OWNER_ID }, ACTOR_ID);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskAssignedEvent.eventName,
        expect.any(TaskAssignedEvent),
      );
      const emitted = eventEmitter.emit.mock.calls[0][1] as TaskAssignedEvent;
      expect(emitted.taskId).toBe(TASK_ID);
      expect(emitted.assigneeId).toBe(OWNER_ID);
      expect(emitted.taskTitle).toBe('Implement login');
      // The authenticated actor reassigned the task — real user id sender.
      expect(emitted.assignedBy).toBe(ACTOR_ID);
    });

    it('should NOT emit task.assigned when the assignee is unchanged', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      projectsRepository.findById.mockResolvedValue(project);
      tasksRepository.update.mockResolvedValue(taskWithAssignee(MEMBER_ID));

      await service.update(TASK_ID, { assignee: MEMBER_ID }, ACTOR_ID);

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        TaskAssignedEvent.eventName,
        expect.anything(),
      );
    });

    it('should NOT emit task.assigned when the assignee field is not touched', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      tasksRepository.update.mockResolvedValue(taskWithAssignee(MEMBER_ID));

      await service.update(TASK_ID, { title: 'Renamed' }, ACTOR_ID);

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        TaskAssignedEvent.eventName,
        expect.anything(),
      );
    });

    it('should throw BadRequestException when reassigning to a non-member (BR-005)', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      projectsRepository.findById.mockResolvedValue(project);

      await expect(
        service.update(
          TASK_ID,
          { assignee: '507f1f77bcf86cd799439099' },
          ACTOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        TaskAssignedEvent.eventName,
        expect.anything(),
      );
    });

    it('should clear deadlineUrgentNotifiedAt when the due date changes (FR-008.3)', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      tasksRepository.update.mockResolvedValue(taskWithAssignee(MEMBER_ID));

      await service.update(TASK_ID, { dueDate: '2024-12-15' }, ACTOR_ID);

      expect(tasksRepository.update).toHaveBeenCalledWith(
        TASK_ID,
        expect.objectContaining({ deadlineUrgentNotifiedAt: null }),
      );
    });

    it('should NOT clear deadlineUrgentNotifiedAt when the due date is unchanged', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      tasksRepository.update.mockResolvedValue(taskWithAssignee(MEMBER_ID));

      // Same timestamp as the stored task dueDate (2024-06-01) — a no-op
      // PATCH must not reset the dedup flag and re-alert the assignee.
      await service.update(TASK_ID, { dueDate: '2024-06-01' }, ACTOR_ID);

      expect(tasksRepository.update).not.toHaveBeenCalledWith(
        TASK_ID,
        expect.objectContaining({ deadlineUrgentNotifiedAt: null }),
      );
    });

    it('should clear deadlineUrgentNotifiedAt when the assignee changes (FR-008.3)', async () => {
      tasksRepository.findById.mockResolvedValue(taskWithAssignee(MEMBER_ID));
      projectsRepository.findById.mockResolvedValue(project);
      tasksRepository.update.mockResolvedValue(taskWithAssignee(OWNER_ID));

      await service.update(TASK_ID, { assignee: OWNER_ID }, ACTOR_ID);

      // The new assignee inherits the deadline — the stale alert flag must
      // reset so they get their own urgent notification.
      expect(tasksRepository.update).toHaveBeenCalledWith(
        TASK_ID,
        expect.objectContaining({ deadlineUrgentNotifiedAt: null }),
      );
    });

    it('should re-alert the new assignee when reassigned with a deadline within 24h (FR-008.3)', async () => {
      const urgentTask = taskWithAssignee(MEMBER_ID);
      urgentTask.dueDate = new Date(Date.now() + 10 * 60 * 60 * 1000);
      const reassignedTask = {
        ...urgentTask,
        assigneeId: OWNER_ID,
      };
      tasksRepository.findById.mockResolvedValue(urgentTask);
      projectsRepository.findById.mockResolvedValue(project);
      tasksRepository.update.mockResolvedValue(reassignedTask);

      await service.update(TASK_ID, { assignee: OWNER_ID }, ACTOR_ID);

      const urgentCall = eventEmitter.emit.mock.calls.find(
        ([name]) => name === TaskDeadlineUrgentEvent.eventName,
      )!;
      expect(urgentCall[1]).toBeInstanceOf(TaskDeadlineUrgentEvent);
      const emitted = urgentCall[1] as TaskDeadlineUrgentEvent;
      expect(emitted.assigneeId).toBe(OWNER_ID);
      expect(tasksRepository.markDeadlineUrgentNotified).toHaveBeenCalledWith(
        TASK_ID,
      );
    });
  });

  // ─── findById() ───────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return task when found', async () => {
      tasksRepository.findById.mockResolvedValue(mockTask);

      const result = await service.findById('task-id-123');

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Membership-scoped reads (FR-004/FR-005 visibility) ───────────────────

  describe('membership-scoped read routes', () => {
    const teamMember = {
      _id: { toString: () => 'member-id' },
      role: UserRole.TEAM_MEMBER,
    } as any;
    const pm = {
      _id: { toString: () => 'pm-id' },
      role: UserRole.PROJECT_MANAGER,
    } as any;
    const admin = {
      _id: { toString: () => 'admin-id' },
      role: UserRole.ADMIN,
    } as any;

    const taskDoc = {
      _id: { toString: () => 'task-id-123' },
      title: 'Implement login',
      toObject: () => ({ _id: 'task-id-123', title: 'Implement login' }),
    } as any;

    describe('findAll()', () => {
      it('Team Member sees only tasks in their projects', async () => {
        projectsRepository.findIdsForMember.mockResolvedValue([
          { toString: () => 'project-a' },
        ] as any);
        tasksRepository.findByProjectIds.mockResolvedValue([taskDoc]);

        const result = await service.findAll(teamMember);

        expect(projectsRepository.findIdsForMember).toHaveBeenCalledWith(
          'member-id',
        );
        expect(tasksRepository.findByProjectIds).toHaveBeenCalledWith(
          expect.any(Array),
        );
        expect(tasksRepository.findAll).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
      });

      it('PM/Admin sees all tasks without scoping (BR-001)', async () => {
        tasksRepository.findAll.mockResolvedValue([taskDoc]);

        const result = await service.findAll(pm);

        expect(tasksRepository.findAll).toHaveBeenCalled();
        expect(tasksRepository.findByProjectIds).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);

        tasksRepository.findAll.mockClear();
        await service.findAll(admin);
        expect(tasksRepository.findAll).toHaveBeenCalled();
      });

      it('missing user fails closed', async () => {
        await expect(service.findAll(undefined)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(tasksRepository.findAll).not.toHaveBeenCalled();
      });
    });

    describe('findByProject()', () => {
      it('Team Member outside the project gets an empty list', async () => {
        projectsRepository.isUserMemberOfProject.mockResolvedValue(false);

        const result = await service.findByProject('project-b', teamMember);

        expect(projectsRepository.isUserMemberOfProject).toHaveBeenCalledWith(
          'member-id',
          'project-b',
        );
        expect(result).toEqual([]);
        expect(tasksRepository.findByProject).not.toHaveBeenCalled();
      });

      it('Team Member inside the project sees its tasks', async () => {
        projectsRepository.isUserMemberOfProject.mockResolvedValue(true);
        tasksRepository.findByProject.mockResolvedValue([taskDoc]);

        const result = await service.findByProject('project-a', teamMember);

        expect(tasksRepository.findByProject).toHaveBeenCalledWith('project-a');
        expect(result).toHaveLength(1);
      });

      it('PM/Admin bypasses the membership gate (BR-001)', async () => {
        tasksRepository.findByProject.mockResolvedValue([taskDoc]);

        const result = await service.findByProject('any-project', pm);

        expect(projectsRepository.isUserMemberOfProject).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
      });

      it('missing user fails closed', async () => {
        await expect(
          service.findByProject('project-a', undefined),
        ).rejects.toThrow(UnauthorizedException);
        expect(tasksRepository.findByProject).not.toHaveBeenCalled();
      });
    });

    describe('findByAssignee()', () => {
      it('Team Member queries are scoped to their projects', async () => {
        projectsRepository.findIdsForMember.mockResolvedValue([
          { toString: () => 'project-a' },
        ] as any);
        tasksRepository.findByAssigneeInProjects.mockResolvedValue([taskDoc]);

        const result = await service.findByAssignee('other-user', teamMember);

        expect(tasksRepository.findByAssigneeInProjects).toHaveBeenCalledWith(
          'other-user',
          expect.any(Array),
        );
        expect(tasksRepository.findByAssignee).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
      });

      it('PM/Admin queries are unscoped', async () => {
        tasksRepository.findByAssignee.mockResolvedValue([taskDoc]);

        const result = await service.findByAssignee('any-user', pm);

        expect(tasksRepository.findByAssignee).toHaveBeenCalledWith('any-user');
        expect(result).toHaveLength(1);
      });
    });
  });
});
