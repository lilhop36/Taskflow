import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

export enum ActivityType {
  // Task activities
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_ARCHIVED = 'TASK_ARCHIVED',

  // Project activities
  PROJECT_CREATED = 'PROJECT_CREATED',
  PROJECT_UPDATED = 'PROJECT_UPDATED',
  PROJECT_STATUS_CHANGED = 'PROJECT_STATUS_CHANGED',
  PROJECT_ARCHIVED = 'PROJECT_ARCHIVED',

  // Comment activities
  COMMENT_ADDED = 'COMMENT_ADDED',
  COMMENT_EDITED = 'COMMENT_EDITED',
  COMMENT_DELETED = 'COMMENT_DELETED',

  // User activities
  USER_JOINED = 'USER_JOINED',
  USER_LEFT = 'USER_LEFT',
  USER_ASSIGNED = 'USER_ASSIGNED',

  // Sprint activities
  SPRINT_CREATED = 'SPRINT_CREATED',
  SPRINT_STARTED = 'SPRINT_STARTED',
  SPRINT_COMPLETED = 'SPRINT_COMPLETED',

  // Dependency activities
  DEPENDENCY_ADDED = 'DEPENDENCY_ADDED',
  DEPENDENCY_REMOVED = 'DEPENDENCY_REMOVED',
  TASK_BLOCKED = 'TASK_BLOCKED',
  TASK_UNBLOCKED = 'TASK_UNBLOCKED',
}

@Schema({ timestamps: true })
export class Activity {
  @Prop({ required: true, enum: ActivityType })
  type: ActivityType;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  actor: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  // Entity that the activity relates to
  @Prop({ type: Types.ObjectId, ref: 'Task' })
  task?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  project?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  user?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment' })
  comment?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Sprint' })
  sprint?: Types.ObjectId;

  // Changes data (for update activities)
  @Prop({ type: Object })
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];

  // Additional metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // Visibility (public vs private activities)
  @Prop({ type: Boolean, default: true })
  isPublic: boolean;

  // User mentions
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentionedUsers: Types.ObjectId[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Indexes for efficient activity queries
ActivitySchema.index({ project: 1, createdAt: -1 });
ActivitySchema.index({ task: 1, createdAt: -1 });
ActivitySchema.index({ actor: 1, createdAt: -1 });
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ mentionedUsers: 1, createdAt: -1 });
