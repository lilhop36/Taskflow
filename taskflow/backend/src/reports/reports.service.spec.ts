import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { TaskStatus } from '../tasks/schemas/task.schema';
import { ProjectStatus } from '../projects/schemas/project.schema';

describe('ReportsService', () => {
  let service: ReportsService;
  let projectsRepository: jest.Mocked<ProjectsRepository>;
  let tasksRepository: jest.Mocked<TasksRepository>;
  let usersService: jest.Mocked<UsersService>;

  const mockProject = {
    _id: { toString: () => 'project-1' },
    name: 'Project Alpha',
    description: 'Test project',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    status: ProjectStatus.ACTIVE,
    ownerId: 'owner-1',
  } as any;

  const mockUser = {
    _id: { toString: () => 'user-1' },
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'TeamMember',
  } as any;

  // Shared repository mock — the real VisibilityPolicyService is wired on
  // top of it so the dashboard's BR-001/BR-003 scoping is exercised through
  // the same policy the projects/tasks read endpoints use.
  const projectsRepositoryMock = {
    findById: jest.fn(),
    findIdNameForMember: jest.fn(),
    isUserMemberOfProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: ProjectsRepository,
          useValue: projectsRepositoryMock,
        },
        {
          provide: TasksRepository,
          useValue: {
            findByProject: jest.fn(),
            findByAssignee: jest.fn(),
            findForDashboard: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: VisibilityPolicyService,
          useValue: new VisibilityPolicyService(
            projectsRepositoryMock as unknown as ProjectsRepository,
          ),
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    projectsRepository = module.get(ProjectsRepository);
    tasksRepository = module.get(TasksRepository);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProjectReport() — FR-009.1', () => {
    it('should compile project report with task distribution', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      tasksRepository.findByProject.mockResolvedValue([
        {
          _id: 't1',
          title: 'A',
          status: TaskStatus.DONE,
          dueDate: new Date('2024-06-01'),
          assigneeId: 'u1',
          project: 'p1',
        } as any,
        {
          _id: 't2',
          title: 'B',
          status: TaskStatus.TODO,
          dueDate: new Date('2024-12-01'),
          assigneeId: 'u2',
          project: 'p1',
        } as any,
      ]);

      const result = await service.getProjectReport('project-1');

      expect(result.project.name).toBe('Project Alpha');
      expect(result.taskSummary.total).toBe(2);
      expect(result.taskSummary.done).toBe(1);
      expect(result.taskSummary.todo).toBe(1);
      expect(result.taskSummary.completionPercent).toBe(50);
    });

    it('should detect overdue tasks when status is not Done', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      tasksRepository.findByProject.mockResolvedValue([
        {
          _id: 't1',
          title: 'Late',
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date('2020-01-01'),
          assigneeId: 'u1',
          project: 'p1',
        } as any,
      ]);

      const result = await service.getProjectReport('project-1');
      expect(result.overdueCount).toBe(1);
      expect(result.overdueTasks[0].title).toBe('Late');
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectsRepository.findById.mockResolvedValue(null);
      await expect(service.getProjectReport('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDashboard() — FR-006', () => {
    const teamMember = {
      _id: { toString: () => 'member-1' },
      role: UserRole.TEAM_MEMBER,
    } as any;
    const pm = {
      _id: { toString: () => 'pm-1' },
      role: UserRole.PROJECT_MANAGER,
    } as any;

    const leanTask = (overrides: any = {}) => ({
      _id: { toString: () => 'task-1' },
      title: 'Build auth',
      status: TaskStatus.TODO,
      dueDate: new Date('2020-01-01'),
      project: { toString: () => 'project-1' },
      ...overrides,
    });

    it('Admin/PM sees aggregates over all projects (BR-001)', async () => {
      projectsRepository.findIdNameForMember.mockResolvedValue([
        { _id: 'p1', name: 'Alpha' },
      ] as any);
      tasksRepository.findForDashboard.mockResolvedValue([
        leanTask({ status: TaskStatus.DONE }),
        leanTask({
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date('2030-01-01'),
        }),
        // TODO with the default (past) due date — the one overdue task
        leanTask({ status: TaskStatus.TODO }),
      ] as any);

      const result = await service.getDashboard(pm);

      // No userId → every project (Admin/PM view)
      expect(projectsRepository.findIdNameForMember).toHaveBeenCalledWith(
        undefined,
      );
      expect(result.summary.total).toBe(3);
      expect(result.summary.done).toBe(1);
      expect(result.summary.completionPercent).toBe(33);
      expect(result.summary.overdueCount).toBe(1); // only the TODO 2020 task
      expect(result.distribution).toEqual({
        todo: 1,
        inProgress: 1,
        done: 1,
      });
      expect(result.projects).toEqual([{ _id: 'p1', name: 'Alpha' }]);
      expect(result.overdueTasks[0].title).toBe('Build auth');
    });

    it('Team Member aggregates only their own projects', async () => {
      projectsRepository.findIdNameForMember.mockResolvedValue([
        { _id: 'p1', name: 'Alpha' },
      ] as any);
      tasksRepository.findForDashboard.mockResolvedValue([]);

      const result = await service.getDashboard(teamMember);

      expect(projectsRepository.findIdNameForMember).toHaveBeenCalledWith(
        'member-1',
      );
      expect(result.summary.total).toBe(0);
      expect(result.summary.completionPercent).toBe(0);
    });

    it('scopes to a single project when ?project= is provided', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      projectsRepository.isUserMemberOfProject.mockResolvedValue(true);
      tasksRepository.findForDashboard.mockResolvedValue([
        leanTask({ status: TaskStatus.DONE }),
      ] as any);

      const result = await service.getDashboard(teamMember, 'project-1');

      expect(projectsRepository.isUserMemberOfProject).toHaveBeenCalledWith(
        'member-1',
        'project-1',
      );
      expect(projectsRepository.findIdNameForMember).not.toHaveBeenCalled();
      expect(result.projects).toEqual([
        { _id: 'project-1', name: 'Project Alpha' },
      ]);
      expect(result.summary.total).toBe(1);
      expect(result.summary.done).toBe(1);
    });

    it('throws ForbiddenException when a Team Member filters a project they are not in', async () => {
      projectsRepository.findById.mockResolvedValue(mockProject);
      projectsRepository.isUserMemberOfProject.mockResolvedValue(false);

      await expect(
        service.getDashboard(teamMember, 'project-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the filtered project does not exist', async () => {
      projectsRepository.findById.mockResolvedValue(null);

      await expect(service.getDashboard(pm, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException when the user is missing', async () => {
      await expect(service.getDashboard(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getEmployeeReport() — FR-009.2', () => {
    it('should compute on-time rate for employee tasks', async () => {
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.findByAssignee.mockResolvedValue([
        // completedAt drives on-time calculation — updatedAt must NOT be used
        {
          _id: 't1',
          title: 'OnTime',
          status: TaskStatus.DONE,
          dueDate: new Date('2024-06-01'),
          completedAt: new Date('2024-05-01'),
          updatedAt: new Date('2024-09-01'),
          project: 'p1',
        } as any,
        {
          _id: 't2',
          title: 'Late',
          status: TaskStatus.DONE,
          dueDate: new Date('2024-06-01'),
          completedAt: new Date('2024-07-01'),
          updatedAt: new Date('2024-07-01'),
          project: 'p1',
        } as any,
      ]);

      const result = await service.getEmployeeReport('user-1');

      expect(result.employee.firstName).toBe('Alice');
      expect(result.taskSummary.totalAssigned).toBe(2);
      expect(result.taskSummary.completedOnTime).toBe(1);
      expect(result.taskSummary.completedLate).toBe(1);
      expect(result.performanceMetrics.onTimeRate).toBe(50);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);
      await expect(service.getEmployeeReport('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
