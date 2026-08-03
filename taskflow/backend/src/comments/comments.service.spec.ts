import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommentsService } from './comments.service';
import { CommentsRepository } from './comments.repository';
import { TasksRepository } from '../tasks/tasks.repository';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepository: jest.Mocked<CommentsRepository>;
  let tasksRepository: jest.Mocked<TasksRepository>;
  let eventEmitter: { emit: jest.Mock };

  // Valid ObjectId hex strings — the service casts taskId/authorId via
  // new Types.ObjectId(), so fake IDs like 'task-id-123' throw BSONError.
  const TASK_ID = '507f1f77bcf86cd799439011';
  const AUTHOR_ID = '507f1f77bcf86cd799439015';
  const ASSIGNEE_ID = '507f1f77bcf86cd799439016';

  const mockTask = {
    _id: { toString: () => TASK_ID },
    title: 'Sample Task',
    assignee: { toString: () => ASSIGNEE_ID },
  } as any;

  const mockComment = {
    _id: { toString: () => 'comment-id-1' },
    content: 'Hello task',
    task: TASK_ID,
    author: AUTHOR_ID,
    toObject: () => ({
      _id: 'comment-id-1',
      content: 'Hello task',
      task: TASK_ID,
      author: AUTHOR_ID,
    }),
  } as any;

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: CommentsRepository,
          useValue: {
            create: jest.fn(),
            findByTaskWithFilter: jest.fn(),
          },
        },
        {
          provide: TasksRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    commentsRepository = module.get(CommentsRepository);
    tasksRepository = module.get(TasksRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create() — FR-007.2, FR-007.3', () => {
    it('should create a comment and emit comment.created event', async () => {
      tasksRepository.findById.mockResolvedValue(mockTask);
      commentsRepository.create.mockResolvedValue(mockComment);

      const result = await service.create(
        { content: 'Hello task' } as any,
        TASK_ID,
        AUTHOR_ID,
      );

      expect(commentsRepository.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'comment.created',
        expect.objectContaining({
          taskId: TASK_ID,
          authorId: AUTHOR_ID,
          assigneeId: ASSIGNEE_ID,
        }),
      );
      expect(result.content).toBe('Hello task');
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ content: 'x' } as any, '507f1f77bcf86cd799439019', AUTHOR_ID),
      ).rejects.toThrow(NotFoundException);
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByTask() — FR-007.1', () => {
    it('should return comments for a task', async () => {
      commentsRepository.findByTaskWithFilter.mockResolvedValue([mockComment]);
      const result = await service.findByTask(TASK_ID);
      expect(result).toHaveLength(1);
      expect(commentsRepository.findByTaskWithFilter).toHaveBeenCalledWith(
        expect.objectContaining({ task: expect.anything() }),
      );
    });

    it('should return empty array when task has no comments', async () => {
      commentsRepository.findByTaskWithFilter.mockResolvedValue([]);
      const result = await service.findByTask(TASK_ID);
      expect(result).toEqual([]);
    });
  });
});
