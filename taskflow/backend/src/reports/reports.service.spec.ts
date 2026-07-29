import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
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
    owner: { toString: () => 'owner-1' },
  } as any;

  const mockUser = {
    _id: { toString: () => 'user-1' },
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'TeamMember',
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: ProjectsRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: TasksRepository,
          useValue: { findByProject: jest.fn(), findByAssignee: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn() },
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
        { _id: 't1', title: 'A', status: TaskStatus.DONE, dueDate: new Date('2024-06-01'), assignee: 'u1', project: 'p1' } as any,
        { _id: 't2', title: 'B', status: TaskStatus.TODO, dueDate: new Date('2024-12-01'), assignee: 'u2', project: 'p1' } as any,
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
        { _id: 't1', title: 'Late', status: TaskStatus.IN_PROGRESS, dueDate: new Date('2020-01-01'), assignee: 'u1', project: 'p1' } as any,
      ]);

      const result = await service.getProjectReport('project-1');
      expect(result.overdueCount).toBe(1);
      expect(result.overdueTasks[0].title).toBe('Late');
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectsRepository.findById.mockResolvedValue(null);
      await expect(service.getProjectReport('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEmployeeReport() — FR-009.2', () => {
    it('should compute on-time rate for employee tasks', async () => {
      usersService.findById.mockResolvedValue(mockUser);
      tasksRepository.findByAssignee.mockResolvedValue([
        { _id: 't1', title: 'OnTime', status: TaskStatus.DONE, dueDate: new Date('2024-06-01'), updatedAt: new Date('2024-05-01'), createdAt: new Date('2024-01-01'), project: 'p1' } as any,
        { _id: 't2', title: 'Late', status: TaskStatus.DONE, dueDate: new Date('2024-06-01'), updatedAt: new Date('2024-07-01'), createdAt: new Date('2024-01-01'), project: 'p1' } as any,
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
      await expect(service.getEmployeeReport('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
