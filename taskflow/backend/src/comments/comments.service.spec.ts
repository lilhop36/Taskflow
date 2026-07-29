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

  const mockTask = {
    _id: { toString: () => 'task-id-123' },
    title: 'Sample Task',
    assignee: { toString: () => 'assignee-id' },
  } as any;

  const mockComment = {
    _id: { toString: () => 'comment-id-1' },
    content: 'Hello task',
    task: 'task-id-123',
    author: 'author-id',
    toObject: () => ({
      _id: 'comment-id-1',
      content: 'Hello task',
      task: 'task-id-123',
      author: 'author-id',
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
            findByTask: jest.fn(),
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
        'task-id-123',
        'author-id',
      );

      expect(commentsRepository.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'comment.created',
        expect.objectContaining({
          taskId: 'task-id-123',
          authorId: 'author-id',
          assigneeId: 'assignee-id',
        }),
      );
      expect(result.content).toBe('Hello task');
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ content: 'x' } as any, 'missing', 'author-id'),
      ).rejects.toThrow(NotFoundException);
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByTask() — FR-007.1', () => {
    it('should return comments for a task', async () => {
      commentsRepository.findByTask.mockResolvedValue([mockComment]);
      const result = await service.findByTask('task-id-123');
      expect(result).toHaveLength(1);
      expect(commentsRepository.findByTask).toHaveBeenCalledWith('task-id-123');
    });

    it('should return empty array when task has no comments', async () => {
      commentsRepository.findByTask.mockResolvedValue([]);
      const result = await service.findByTask('task-id-123');
      expect(result).toEqual([]);
    });
  });
});
