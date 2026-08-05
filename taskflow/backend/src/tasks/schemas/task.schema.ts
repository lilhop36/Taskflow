import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { refId } from '../../common/ref-id';

/**
 * Stable ref-id surface on Task documents (populated or raw ObjectId).
 * `assigneeId` resolves the assignee ref to its id string regardless of
 * whether the repository populated it — the seam that fixes the runtime
 * `toString()`-on-populated-doc bug.
 */
export interface TaskDocumentRefs {
  assigneeId: string | null;
}

export type TaskDocument = HydratedDocument<Task> & TaskDocumentRefs;

export enum TaskStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
}

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Prop({ required: true, enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'Project' })
  project: Types.ObjectId;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'User' })
  assignee: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId | null;

  /**
   * When the task was last marked Done (null while open).
   * Records the true completion time so reports can compute on-time
   * delivery — updatedAt is unreliable for this because it changes on
   * any edit, not just completion (FR-009.2).
   */
  @Prop({ type: Date })
  completedAt?: Date | null;

  /**
   * Set when a "deadline urgent" notification has been emitted for this
   * task (FR-008.3). Acts as a dedup flag so the hourly DeadlineUrgentCron
   * and the create/update emit paths each alert the assignee only once
   * per deadline. Cleared whenever the due date changes or the task is
   * reopened, so a new deadline can trigger a fresh alert.
   */
  @Prop({ type: Date, default: null })
  deadlineUrgentNotifiedAt?: Date | null;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.virtual('assigneeId').get(function (this: TaskDocument) {
  return refId(this.assignee);
});
