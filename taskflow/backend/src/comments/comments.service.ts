import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { TasksRepository } from '../tasks/tasks.repository';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsRepository } from './comments.repository';

/**
 * Service — owns all business logic for the Comments domain.
 *
 * SRS: FR-007.1-3
 * - Maintains chronological threads per task (FR-007.1)
 * - Validates user has access to the parent project (FR-007.2)
 * - Author + timestamp appended automatically by Mongoose timestamps (FR-007.3)
 *
 * Events:
 * - Emits 'comment.created' when a new comment is posted, so the Notification
 *   module can alert the task assignee or project owner.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly commentsRepository: CommentsRepository,
    private readonly tasksRepository: TasksRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates a comment on a task.
   *
   * Step 1: Verify the task exists (404 if not).
   * Step 2: Create the comment with content, task ID, and author ID.
   * Step 3: Emit an event so notification listeners can react.
   *
   * FR-007.2: "authorized users who have access to the parent project"
   * — access control is delegated to the controller/auth layer. By the time
   * this service runs, the user is authenticated. The task existence check
   * is the minimum guard; full RBAC (project membership) will be enforced
   * once auth guards are wired globally.
   */
  async create(
    createCommentDto: CreateCommentDto,
    taskId: string,
    authorId: string,
  ) {
    // Step 1: Verify the task exists
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Step 2: Persist the comment
    const commentData: any = {
      content: createCommentDto.content,
      task: new Types.ObjectId(taskId),
    };
    // Only set author when a valid ID is provided (guards not wired yet)
    if (authorId) {
      commentData.author = new Types.ObjectId(authorId);
    }
    const comment = await this.commentsRepository.create(commentData);

    // Step 3: Fire event for notification listeners
    const assigneeId = task.assignee?.toString();
    this.eventEmitter.emit('comment.created', {
      taskId,
      commentId: comment._id.toString(),
      authorId,
      assigneeId,
      taskTitle: task.title,
    });

    return comment.toObject();
  }

  /**
   * Returns all comments for a task, sorted oldest-first (FR-007.1).
   */
  async findByTask(taskId: string) {
    const comments = await this.commentsRepository.findByTask(taskId);
    return comments.map((c) => c.toObject());
  }
}
