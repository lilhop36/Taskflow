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
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
