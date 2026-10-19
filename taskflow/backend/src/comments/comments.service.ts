import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { TasksRepository } from '../tasks/tasks.repository';
import { UserRole } from '../users/schemas/user.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsRepository } from './comments.repository';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CommentCreatedEvent } from '../notifications/events/comment-created.event';

/**
 * Service — owns all business logic for the Comments domain.
 *
 * SRS: FR-007.1-3
 * - Maintains chronological threads per task (FR-007.1)
 * - Validates user has access to the parent project (FR-007.2)
 * - Author + timestamp appended automatically by Mongoose timestamps (FR-007.3)
 * - Edit history and soft delete for audit trail (BR-005)
 *
 * Events:
 * - Emits CommentCreatedEvent when a new comment is posted, so the Notification
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
   * Step 2: When replying (replyTo set), verify the parent comment exists
   *         and belongs to the same task (404 / 400 otherwise) so threads
   *         cannot cross tasks.
   * Step 3: Persist the comment with content, task ID, author ID, and replyTo.
   * Step 4: Emit an event so notification listeners can react — the payload
   *         carries replyTo + parentAuthorId so listeners can notify both the
   *         task assignee and the original comment author (threaded comments).
   *
   * FR-007.2: "authorized users who have access to the parent project"
   * — project membership is enforced in CommentsController by the
   * ProjectMemberGuard via the shared VisibilityPolicyService (BR-001 bypass
   * for Admins/PMs, owner-or-member for Team Members). By the time this
   * service runs, the user is authenticated and authorized.
   */
  async create(
    createCommentDto: CreateCommentDto,
    taskId: string,
    authorId: string,
    authorName?: string,
  ) {
    // Step 1: Verify the task exists
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Step 2: Validate the parent comment when this is a reply
    let parentAuthorId: string | undefined;
    if (createCommentDto.replyTo) {
      const parent = await this.commentsRepository.findById(
        createCommentDto.replyTo,
      );
      if (!parent) {
        throw new NotFoundException(
          'The comment being replied to was not found',
        );
      }
      if (parent.task.toString() !== taskId) {
        throw new BadRequestException(
          'Cannot reply to a comment on a different task',
        );
      }
      // findById populates `author` — use the stable authorId shape.
      parentAuthorId = parent.authorId ?? undefined;
    }

    // Normalize authorId to a string: the controller passes @CurrentUser('_id')
    // which is an ObjectId (a populated User document's _id), while event
    // payloads and listener comparisons (assigneeId !== authorId) need strings.
    const authorIdStr = authorId?.toString();

    // Step 3: Persist the comment
    const commentData: Partial<Comment> = {
      content: createCommentDto.content,
      task: new Types.ObjectId(taskId),
    };
    // authorId is always provided by the controller via @CurrentUser()
    if (authorIdStr) {
      commentData.author = new Types.ObjectId(authorIdStr);
    }
    // Threaded comments: link the reply to its parent comment (same task)
    if (createCommentDto.replyTo) {
      commentData.replyTo = new Types.ObjectId(createCommentDto.replyTo);
    }
    const comment = await this.commentsRepository.create(commentData);

    // Step 4: Fire event for notification listeners.
    // NOTE: tasksRepository.findById populates `assignee` — use the stable
    // assigneeId shape instead of the inspect-blob toString() of a populated doc.
    const assigneeId = task.assigneeId;
    this.eventEmitter.emit(
      CommentCreatedEvent.eventName,
      new CommentCreatedEvent(
        taskId,
        comment._id.toString(),
        authorIdStr,
        // Event field is `string | undefined`; the virtual yields `string | null`.
        assigneeId ?? undefined,
        task.title,
        authorName,
        createCommentDto.replyTo,
        parentAuthorId,
      ),
    );

    return comment.toObject();
  }

  /**
   * Finds a comment by ID.
   * Used for ownership verification and direct access.
   */
  async findCommentById(commentId: string) {
    return this.commentsRepository.findById(commentId);
  }

  /**
   * Updates a comment with new content.
   * Step 1: Verify the comment exists.
   * Step 2: Enforce BR-005: only the author (or a PM/Admin moderator) may edit.
   * Step 3: Update the comment and record the edit in history.
   *
   * BR-005: Maintains edit history and sets isEdited flag; modification is
   * "restricted according to organizational policy" — authors edit their own
   * comments; Project Managers and Administrators moderate (BR-001 hierarchy).
   */
  async updateComment(
    commentId: string,
    content: string,
    user: { id: string; role?: UserRole },
  ) {
    // Step 1: Verify the comment exists
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Step 2: BR-005 ownership + moderation policy
    this.assertCanModify(comment, user);

    // Step 3: Update the comment and record edit history
    const updatedComment = await this.commentsRepository.updateComment(
      commentId,
      content,
      user.id,
    );
    if (!updatedComment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    return updatedComment.toObject();
  }

  /**
   * Soft deletes a comment (marks as deleted but preserves for audit).
   * Step 1: Verify the comment exists.
   * Step 2: Enforce BR-005: only the author (or a PM/Admin moderator) may delete.
   * Step 3: Mark the comment as deleted with deletion info.
   *
   * BR-005: Maintains deletion audit trail with deletedAt and deletedBy;
   * "administrative removal" by PM/Admin is the moderation path.
   */
  async deleteComment(
    commentId: string,
    user: { id: string; role?: UserRole },
  ) {
    // Step 1: Verify the comment exists
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Step 2: BR-005 ownership + moderation policy
    this.assertCanModify(comment, user);

    // Step 3: Soft delete the comment
    const deletedComment = await this.commentsRepository.softDelete(
      commentId,
      user.id,
    );
    if (!deletedComment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    return deletedComment.toObject();
  }

  /**
   * BR-005 ownership + moderation policy for edit/delete.
   *
   * Allowed to modify:
   * - the comment's author (their own comment)
   * - Project Managers and Administrators (moderation, BR-001 hierarchy)
   *
   * Denied: any other project member — participation in the thread (FR-007.2)
   * does not grant the right to alter or remove another member's comment.
   */
  private assertCanModify(
    comment: CommentDocument,
    user: { id: string; role?: UserRole },
  ) {
    // findById populates `author` — compare against its _id (a populated
    // doc's .toString() is an inspect blob, not the id)
    const isAuthor = comment.authorId === user.id;
    const isModerator =
      user.role === UserRole.PROJECT_MANAGER || user.role === UserRole.ADMIN;
    if (!isAuthor && !isModerator) {
      throw new ForbiddenException(
        'Only the comment author or a project manager can modify this comment',
      );
    }
  }

  /**
   * Returns all comments for a task, sorted oldest-first (FR-007.1).
   * Filters out soft-deleted comments unless explicitly requested to include them.
   */
  async findByTask(taskId: string, includeDeleted: boolean = false) {
    const filter: Record<string, unknown> = {
      task: new Types.ObjectId(taskId),
    };
    if (!includeDeleted) {
      filter.deletedAt = { $exists: false };
    }

    const comments = await this.commentsRepository.findByTaskWithFilter(filter);
    return comments.map((c) => c.toObject());
  }
}
