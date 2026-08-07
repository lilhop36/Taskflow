import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommentsService } from './comments.service';
import { CommentsRepository } from './comments.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { UserRole } from '../users/schemas/user.schema';
import { CommentCreatedEvent } from '../notifications/events/comment-created.event';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepository: jest.Mocked<CommentsRepository>;
  let tasksRepository: jest.Mocked<TasksRepository>;
  let eventEmitter: { emit: jest.Mock };

  // Valid ObjectId hex strings — the service casts ids via
  // new Types.ObjectId(), so fake IDs like 'task-id-123' throw BSONError.
  const TASK_ID = '507f1f77bcf86cd799439011';
  const AUTHOR_ID = '507f1f77bcf86cd799439015';
  const ASSIGNEE_ID = '507f1f77bcf86cd799439016';
  const OTHER_TASK_ID = '507f1f77bcf86cd799439017';
  const REPLY_TO_ID = '507f1f77bcf86cd799439012';
  const PARENT_AUTHOR_ID = '507f1f77bcf86cd799439013';

  // assignee mirrors the real runtime shape: tasksRepository.findById
  // populates it, so it is a User document with an `_id` (not a raw ObjectId
  // whose toString() is the id).
  const mockTask = {
    _id: { toString: () => TASK_ID },
    title: 'Sample Task',
    assigneeId: ASSIGNEE_ID,
  } as any;

  const mockComment = {
    _id: { toString: () => 'comment-id-1' },
    content: 'Hello task',
    task: TASK_ID,
    author: AUTHOR_ID,
    authorId: AUTHOR_ID,
    toObject: () => ({
      _id: 'comment-id-1',
      content: 'Hello task',
      task: TASK_ID,
      author: AUTHOR_ID,
    }),
  } as any;

  // Parent comment for reply tests — belongs to TASK_ID, authored by someone
  // other than the replier so notifications have a distinct target.
  const mockParentComment = {
    _id: { toString: () => REPLY_TO_ID },
    content: 'Parent comment',
    task: TASK_ID,
    author: PARENT_AUTHOR_ID,
    authorId: PARENT_AUTHOR_ID,
    toObject: () => ({
      _id: REPLY_TO_ID,
      content: 'Parent comment',
      task: TASK_ID,
      author: PARENT_AUTHOR_ID,
    }),
  } as any;

  const mockReply = {
    _id: { toString: () => 'comment-id-2' },
    content: 'A reply',
    task: TASK_ID,
    author: AUTHOR_ID,
    authorId: AUTHOR_ID,
    replyTo: REPLY_TO_ID,
    toObject: () => ({
      _id: 'comment-id-2',
      content: 'A reply',
      task: TASK_ID,
      author: AUTHOR_ID,
      replyTo: REPLY_TO_ID,
    }),
  } as any;

  const authorUser = { id: AUTHOR_ID, role: UserRole.TEAM_MEMBER } as any;
  const pmUser = { id: ASSIGNEE_ID, role: UserRole.PROJECT_MANAGER } as any;
  const adminUser = { id: ASSIGNEE_ID, role: UserRole.ADMIN } as any;
  const otherMember = { id: ASSIGNEE_ID, role: UserRole.TEAM_MEMBER } as any;

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: CommentsRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            updateComment: jest.fn(),
            softDelete: jest.fn(),
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
        { content: 'Hello task' },
        TASK_ID,
        AUTHOR_ID,
      );

      expect(commentsRepository.create).toHaveBeenCalled();
      // The typed event contract: emitted under the shared eventName key with
      // a constructed CommentCreatedEvent payload.
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CommentCreatedEvent.eventName,
        expect.any(CommentCreatedEvent),
      );
      const emitted = eventEmitter.emit.mock.calls[0][1] as CommentCreatedEvent;
      expect(emitted.taskId).toBe(TASK_ID);
      expect(emitted.authorId).toBe(AUTHOR_ID);
      expect(emitted.assigneeId).toBe(ASSIGNEE_ID);
      expect(result.content).toBe('Hello task');
    });

    it('should throw NotFoundException when task does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ content: 'x' } as any, OTHER_TASK_ID, AUTHOR_ID),
      ).rejects.toThrow(NotFoundException);
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should store replyTo and emit replyTo + parentAuthorId for a reply', async () => {
      tasksRepository.findById.mockResolvedValue(mockTask);
      commentsRepository.findById.mockResolvedValue(mockParentComment);
      commentsRepository.create.mockResolvedValue(mockReply);

      const result = await service.create(
        { content: 'A reply', replyTo: REPLY_TO_ID },
        TASK_ID,
        AUTHOR_ID,
        'Hanna Girma',
      );

      expect(commentsRepository.findById).toHaveBeenCalledWith(REPLY_TO_ID);
      expect(commentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: expect.anything(),
          task: expect.anything(),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CommentCreatedEvent.eventName,
        expect.any(CommentCreatedEvent),
      );
      const emitted = eventEmitter.emit.mock.calls[0][1] as CommentCreatedEvent;
      expect(emitted.taskId).toBe(TASK_ID);
      expect(emitted.authorId).toBe(AUTHOR_ID);
      expect(emitted.authorName).toBe('Hanna Girma');
      expect(emitted.replyTo).toBe(REPLY_TO_ID);
      expect(emitted.parentAuthorId).toBe(PARENT_AUTHOR_ID);
      expect(result.replyTo).toBe(REPLY_TO_ID);
    });

    it('should throw NotFoundException when the parent comment is missing', async () => {
      tasksRepository.findById.mockResolvedValue(mockTask);
      commentsRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { content: 'A reply', replyTo: REPLY_TO_ID } as any,
          TASK_ID,
          AUTHOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when replying across tasks', async () => {
      tasksRepository.findById.mockResolvedValue(mockTask);
      // Parent comment lives on a different task
      commentsRepository.findById.mockResolvedValue({
        ...mockParentComment,
        task: OTHER_TASK_ID,
      });

      await expect(
        service.create(
          { content: 'A reply', replyTo: REPLY_TO_ID } as any,
          TASK_ID,
          AUTHOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
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

    it('should return top-level comments and replies in chronological order', async () => {
      // Sorted oldest-first by the repository — a parent followed by its reply
      commentsRepository.findByTaskWithFilter.mockResolvedValue([
        mockComment,
        mockReply,
      ]);
      const result = await service.findByTask(TASK_ID);
      expect(result.map((c) => c._id)).toEqual([
        'comment-id-1',
        'comment-id-2',
      ]);
      expect(result[1].replyTo).toBe(REPLY_TO_ID);
    });
  });

  describe('updateComment() — BR-005 ownership + moderation', () => {
    it('should allow the author to edit their own comment', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);
      commentsRepository.updateComment.mockResolvedValue({
        ...mockComment,
        content: 'Edited',
        toObject: () => ({ ...mockComment.toObject(), content: 'Edited' }),
      });

      const result = await service.updateComment(
        'comment-id-1',
        'Edited',
        authorUser,
      );

      expect(commentsRepository.updateComment).toHaveBeenCalledWith(
        'comment-id-1',
        'Edited',
        AUTHOR_ID,
      );
      expect(result.content).toBe('Edited');
    });

    it('should forbid a non-author Team Member from editing', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);

      await expect(
        service.updateComment('comment-id-1', 'Edited', otherMember),
      ).rejects.toThrow(ForbiddenException);
      expect(commentsRepository.updateComment).not.toHaveBeenCalled();
    });

    it('should allow a Project Manager to moderate (edit any comment)', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);
      commentsRepository.updateComment.mockResolvedValue(mockComment);

      await service.updateComment('comment-id-1', 'Edited', pmUser);
      expect(commentsRepository.updateComment).toHaveBeenCalled();
    });

    it('should allow an Administrator to moderate (edit any comment)', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);
      commentsRepository.updateComment.mockResolvedValue(mockComment);

      await service.updateComment('comment-id-1', 'Edited', adminUser);
      expect(commentsRepository.updateComment).toHaveBeenCalled();
    });

    it('should throw NotFoundException when the comment does not exist', async () => {
      commentsRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateComment('comment-id-1', 'Edited', authorUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteComment() — BR-005 ownership + moderation', () => {
    it('should allow the author to delete their own comment', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);
      commentsRepository.softDelete.mockResolvedValue(mockComment);

      const result = await service.deleteComment('comment-id-1', authorUser);
      expect(commentsRepository.softDelete).toHaveBeenCalledWith(
        'comment-id-1',
        AUTHOR_ID,
      );
      expect(result).toBeDefined();
    });

    it('should forbid a non-author Team Member from deleting', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);

      await expect(
        service.deleteComment('comment-id-1', otherMember),
      ).rejects.toThrow(ForbiddenException);
      expect(commentsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should allow a Project Manager to moderate (delete any comment)', async () => {
      commentsRepository.findById.mockResolvedValue(mockComment);
      commentsRepository.softDelete.mockResolvedValue(mockComment);

      await service.deleteComment('comment-id-1', pmUser);
      expect(commentsRepository.softDelete).toHaveBeenCalled();
    });
  });
});
