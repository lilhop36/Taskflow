import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

/**
 * Notification types that the system can generate.
 *
 * SRS: FR-008.1-3
 * - TASK_ASSIGNED: alert when a task is assigned to a user (FR-008.1)
 * - STATUS_CHANGED: alert when a task status changes (FR-008.2)
 * - DEADLINE_URGENT: alert when a task is within 24h of due date (FR-008.3)
 */
export enum NotificationType {
  TASK_ASSIGNED = 'TaskAssigned',
  STATUS_CHANGED = 'StatusChanged',
  DEADLINE_URGENT = 'DeadlineUrgent',
}

/**
 * Notification — stored record of a system alert for a user.
 *
 * Each notification is tied to a recipient user and optionally linked
 * to a task (for contextual navigation). Users view and clear these
 * in the notification center (FR-008.4).
 *
 * read: false by default. Users mark as read when they view/clear it.
 */
@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  recipient: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: Types.ObjectId, ref: 'Task' })
  task?: Types.ObjectId;

  @Prop({ default: false })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
