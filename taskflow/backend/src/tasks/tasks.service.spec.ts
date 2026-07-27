import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { UsersService } from '../users/users.service';
import { TaskStatus, TaskPriority } from './schemas/task.schema';

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

  const mockProject = {
    _id: { toString: () => 'project-id-123' },
    name: 'TaskFlow MVP',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    owner: { _id: { toString: () => 'owner-id' } },
    members: [{ _id: { toString: () => 'member-id' } }],
  } as any;

  const mockTask = {
    _id: { toString: () => 'task-id-123' },
    title: 'Implement login',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: new Date('2024-06-01'),
    project: { toString: () => 'project-id-123' },
    assignee: { toString: () => 'member-id' },
    toObject: () => ({
      _id: 'task-id-123',
      title: 'Implement login',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    }),
  } as any;

  const mockUser = {
    _id: { toString: () => 'member-id' },
    email: 'member@example.com',
  } as any;

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
            findByAssignee: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ProjectsRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
          },
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
    const createDto = {
      title: 'Implement login',
      description: 'Build the auth flow',
      priority: TaskPriority.HIGH,
      dueDate: '2024-06-01',
      project: 'project-id-123',
      assignee: 'member-id',
    };

    it('should create a task and emit task.assigned event (FR-004.1, FR-008.1)', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.create.mockResolvedValue(mockTask);

      const result = await service.create(createDto, 'owner-id');

      expect(tasksRepository.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.assigned',
        expect.objectContaining({ assigneeId: 'member-id' }),
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectsRepository.findById.mockResolvedValue(null);

      await expect(service.create(createDto, 'owner-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when assignee is not a project member (BR-005)', async () => {
      const nonMemberProject = {
        ...mockProject,
        members: [], // No members — only the owner
        owner: { _id: { toString: () => 'owner-id' } },
      };
      projectsRepository.findById.mockResolvedValue(nonMemberProject);
      usersService.findById.mockResolvedValue(mockUser);

      const dtoWithNonMember = { ...createDto, assignee: 'stranger-id' };

      await expect(service.create(dtoWithNonMember, 'owner-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when due date is outside project bounds', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockUser);

      const dtoWithBadDate = { ...createDto, dueDate: '2025-06-01' }; // After endDate 2024-12-31

      await expect(service.create(dtoWithBadDate, 'owner-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── updateStatus() — Status FSM (BR-002) ────────────────────────────────

  describe('updateStatus()', () => {
    it('should allow TODO → IN_PROGRESS (BR-002)', async () => {
      const todoTask = { ...mockTask, status: TaskStatus.TODO, toObject: () => ({ status: TaskStatus.IN_PROGRESS }) };
      tasksRepository.findById.mockResolvedValue(todoTask);
      tasksRepository.update.mockResolvedValue(todoTask);

      await expect(
        service.updateStatus('task-id-123', { status: TaskStatus.IN_PROGRESS }),
      ).resolves.not.toThrow();
    });

    it('should reject TODO → DONE (BR-002 — invalid FSM transition)', async () => {
      const todoTask = { ...mockTask, status: TaskStatus.TODO };
      tasksRepository.findById.mockResolvedValue(todoTask);

      await expect(
        service.updateStatus('task-id-123', { status: TaskStatus.DONE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit task.status-changed event on valid transition (FR-008.2)', async () => {
      const inProgressTask = {
        ...mockTask,
        status: TaskStatus.IN_PROGRESS,
        assignee: { toString: () => 'member-id' },
        toObject: () => ({ status: TaskStatus.DONE }),
      };
      tasksRepository.findById.mockResolvedValue(inProgressTask);
      tasksRepository.update.mockResolvedValue(inProgressTask);

      await service.updateStatus('task-id-123', { status: TaskStatus.DONE });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.status-changed',
        expect.objectContaining({ newStatus: TaskStatus.DONE }),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', { status: TaskStatus.IN_PROGRESS }),
      ).rejects.toThrow(NotFoundException);
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
});
