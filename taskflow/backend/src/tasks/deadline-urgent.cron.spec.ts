import { Test, TestingModule } from '@nestjs/testing';
import { DeadlineUrgentCron } from './deadline-urgent.cron';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { TaskStatus } from './schemas/task.schema';

const HOUR_MS = 1000 * 60 * 60;

/**
 * Unit Tests — DeadlineUrgentCron
 *
 * SRS: FR-008.3 — automatic 24-hour deadline alerts for incomplete tasks.
 *
 * Strategy:
 * - TasksRepository and TasksService are mocked.
 * - The cron's only job is to FIND the tasks due within 24h and delegate
 *   the alert to TasksService.notifyUrgentDeadlineIfDue (which owns the
 *   emit + dedup-flag logic and is covered by tasks.service.spec).
 */
describe('DeadlineUrgentCron', () => {
  let cron: DeadlineUrgentCron;
  let tasksRepository: jest.Mocked<TasksRepository>;
  let tasksService: jest.Mocked<TasksService>;

  // A task due 18 hours from "now" — squarely inside the 24h window.
  const urgentTask = {
    _id: { toString: () => 'task-id-123' },
    title: 'Ship the report',
    status: TaskStatus.TODO,
    dueDate: new Date(Date.now() + 18 * HOUR_MS),
    assigneeId: 'assignee-id',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadlineUrgentCron,
        {
          provide: TasksRepository,
          useValue: {
            findDueWithin: jest.fn(),
          },
        },
        {
          provide: TasksService,
          useValue: {
            notifyUrgentDeadlineIfDue: jest.fn(),
          },
        },
      ],
    }).compile();

    cron = module.get<DeadlineUrgentCron>(DeadlineUrgentCron);
    tasksRepository = module.get(TasksRepository);
    tasksService = module.get(TasksService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('scanForUrgentDeadlines()', () => {
    it('should delegate every task due within 24 hours to the service (FR-008.3)', async () => {
      tasksRepository.findDueWithin.mockResolvedValue([urgentTask] as any);

      await cron.scanForUrgentDeadlines();

      // Queries only incomplete tasks in the [now, now + 24h] window
      expect(tasksRepository.findDueWithin).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
      );

      expect(tasksService.notifyUrgentDeadlineIfDue).toHaveBeenCalledWith(
        'task-id-123',
        'Ship the report',
        'assignee-id',
        TaskStatus.TODO,
        expect.any(Date),
      );
    });

    it('should delegate one task at a time', async () => {
      const secondTask = {
        ...urgentTask,
        _id: { toString: () => 'task-id-456' },
        title: 'Review the PR',
      };
      tasksRepository.findDueWithin.mockResolvedValue([
        urgentTask,
        secondTask,
      ] as any);

      await cron.scanForUrgentDeadlines();

      expect(tasksService.notifyUrgentDeadlineIfDue).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no tasks are due within 24 hours', async () => {
      tasksRepository.findDueWithin.mockResolvedValue([]);

      await cron.scanForUrgentDeadlines();

      expect(tasksService.notifyUrgentDeadlineIfDue).not.toHaveBeenCalled();
    });
  });
});
