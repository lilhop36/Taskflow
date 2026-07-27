import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';

/**
 * Repository for Comment documents.
 *
 * Layer: Data Access — the only class that talks to MongoDB Comments.
 * Follows the Repository pattern: services never call Mongoose directly.
 */
@Injectable()
export class CommentsRepository {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
  ) {}

  /**
   * Creates a new comment document.
   * `data` is a Partial<Comment> that must include content, task, and author.
   */
  async create(data: Partial<Comment>): Promise<CommentDocument> {
    const comment = new this.commentModel(data);
    return comment.save();
  }

  /**
   * Finds all comments for a given task, sorted chronologically (oldest first).
   * FR-007.1 requires a "chronological, text-only communication thread at the
   * bottom of every individual task details view."
   * Populating `author` resolves the user's name for display (FR-007.3).
   */
  async findByTask(taskId: string): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ task: new Types.ObjectId(taskId) })
      .sort({ createdAt: 1 })
      .populate('author', '-passwordHash')
      .exec();
  }

  /**
   * Finds a single comment by ID — used for ownership checks and direct access.
   */
  async findById(id: string): Promise<CommentDocument | null> {
    return this.commentModel
      .findById(id)
      .populate('author', '-passwordHash')
      .exec();
  }
}
