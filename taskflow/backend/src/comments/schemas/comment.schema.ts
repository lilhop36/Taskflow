import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { refId } from '../../common/ref-id';

/**
 * Stable ref-id surface on Comment documents (populated or raw ObjectId).
 * `authorId` resolves the author ref to its id string regardless of whether
 * the repository populated it — the seam that fixes the runtime
 * `toString()`-on-populated-doc bug.
 */
export interface CommentDocumentRefs {
  authorId: string | null;
}

export type CommentDocument = HydratedDocument<Comment> & CommentDocumentRefs;

/**
 * Comment — represents a single message in a task-level comment thread.
 *
 * SRS: FR-007.1-3
 * - Chronological thread per task (FR-007.1)
 * - Plain text only (FR-007.1)
 * - Automatic author + timestamp on every post (FR-007.3)   * - Authorized project members can post (FR-007.2 — enforced in controller)
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
  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'Task' })
  task: Types.ObjectId;

  /**
   * Reference to the parent Comment this comment replies to.
   * Optional — top-level comments have no replyTo; replies form a nested,
   * chronological thread under their parent comment (threaded comments).
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Comment' })
  replyTo?: Types.ObjectId;

  /**
   * Reference to the User who wrote this comment.
   * FR-007.3 requires sender's name to be appended — the name is resolved
   * via populate('author') when fetching, avoiding denormalization.
   * Always provided via @CurrentUser() now that JwtAuthGuard is global.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
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
        editedBy: { type: SchemaTypes.ObjectId, ref: 'User' },
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
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.virtual('authorId').get(function (this: CommentDocument) {
  return refId(this.author);
});
