import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

/**
 * Comment — represents a single message in a task-level comment thread.
 *
 * SRS: FR-007.1-3
 * - Chronological thread per task (FR-007.1)
 * - Plain text only (FR-007.1)
 * - Automatic author + timestamp on every post (FR-007.3)
 * - Authorized project members can post (FR-007.2 — enforced in service)
 * - Edit history and soft delete for audit trail (BR-005)
 *
 * UML: Class diagram — Comment class, association with Task and User
 */
@Schema({ timestamps: true })
export class Comment {
  /**
   * The plain text content of the comment. FR-007.1 specifies text-only.
   * trim strips accidental whitespace from copy-paste.
   */
  @Prop({ required: true, trim: true })
  content: string;

  /**
   * Reference to the parent Task. Every comment belongs to exactly one task.
   * This enables the "comments per task" view required by FR-007.1.
   */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Task' })
  task: Types.ObjectId;

  /**
   * Reference to the User who wrote this comment.
   * FR-007.3 requires sender's name to be appended — the name is resolved
   * via populate('author') when fetching, avoiding denormalization.
   *
   * Optional until JwtAuthGuard is wired globally (then it's always provided).
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  author?: Types.ObjectId;

  /**
   * Flag indicating if the comment has been edited.
   * Part of BR-005: Comment audit trail.
   */
  @Prop({ default: false })
  isEdited: boolean;

  /**
   * History of edits made to this comment.
   * Each entry contains the previous content and timestamp of the edit.
   * Part of BR-005: Comment audit trail.
   */
  @Prop({
    type: [
      {
        content: { type: String, required: true },
        editedAt: { type: Date, default: Date.now },
        editedBy: { type: Types.ObjectId, ref: 'User' },
      },
    ],
    default: [],
  })
  editHistory: {
    content: string;
    editedAt: Date;
    editedBy: Types.ObjectId;
  }[];

  /**
   * Soft delete timestamp for audit trail.
   * Part of BR-005: Comment audit trail.
   * When set, indicates the comment has been deleted.
   */
  @Prop({ type: Date })
  deletedAt?: Date;

  /**
   * Reference to the User who deleted this comment.
   * Part of BR-005: Comment audit trail.
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
