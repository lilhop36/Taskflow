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
   * Updates a comment with new content and records the edit in the edit history.
   * Used for implementing comment editing functionality (part of BR-005).
   */
  async updateComment(
    id: string,
    content: string,
    editedBy: string,
  ): Promise<CommentDocument | null> {
    // First, get the current comment to capture its content for history
    const comment = await this.commentModel.findById(id).exec();
    if (!comment) {
      return null;
    }

    // Add the current content to edit history before updating
    const updateData: any = {
      content,
      $push: {
        editHistory: {
          content: comment.content,
          editedAt: new Date(),
          editedBy: new Types.ObjectId(editedBy),
        },
      },
      $set: { isEdited: true },
    };

    return this.commentModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('author', '-passwordHash')
      .exec();
  }

  /**
   * Soft deletes a comment by setting deletedAt and deletedBy fields.
   * Used for implementing comment deletion with audit trail (part of BR-005).
   */
  async softDelete(
    id: string,
    deletedBy: string,
  ): Promise<CommentDocument | null> {
    return this.commentModel
      .findByIdAndUpdate(
        id,
        {
          deletedAt: new Date(),
          deletedBy: new Types.ObjectId(deletedBy),
        },
        { new: true },
      )
      .populate('author', '-passwordHash')
      .exec();
  }

  /**
   * Finds all comments for a given task with optional filtering.
   * Used for finding comments with filters like excluding deleted ones.
   */
  async findByTaskWithFilter(filter: any): Promise<CommentDocument[]> {
    return this.commentModel
      .find(filter)
      .sort({ createdAt: 1 })
      .populate('author', '-passwordHash')
      .exec();
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
