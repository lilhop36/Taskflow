import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

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
}

export const TaskSchema = SchemaFactory.createForClass(Task);
