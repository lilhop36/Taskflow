import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

/**
 * The single typed contract for creating a notification — what the
 * NotificationListener hands to the repository.
 *
 * Ids are hex strings at this boundary; the repository (the persistence
 * seam) converts them to ObjectIds, so no caller ever reaches for `as any`
 * to force a string into a `Types.ObjectId` field.
 *
 * Shared notification contract (concept map):
 *   recipient  → the user the alert is for (required — must be a valid id)
 *   sender     → the user whose action triggered the alert (assigner,
 *                status changer, or commenter). The events are the typed
 *                source: sender is present only when a real human actor is
 *                known, and absent for system-generated alerts — no magic
 *                sentinel strings ever reach this contract.
 *   entityId   → task / comment — the linked entity the alert deep-links to
 *   entityType → type — the NotificationType enum driving the UI badge
 *   title      → folded into message (the task title is part of the text)
 *   message    → the human-readable alert text
 */
export interface CreateNotificationInput {
  recipient: string;
  type: NotificationType;
  message: string;
  task?: string;
  comment?: string;
  sender?: string;
  sprint?: string;
}

/**
 * Notification types that the system can generate.
 *
 * SRS: FR-008.1-3
 * - TASK_ASSIGNED: alert when a task is assigned to a user (FR-008.1)
 * - STATUS_CHANGED: alert when a task status changes (FR-008.2)
 * - DEADLINE_URGENT: alert when a task is within 24h of due date (FR-008.3)
 * - COMMENT: alert when a new comment is posted on a task the user owns/assigns (FR-007)
 * - SPRINT_STARTED: alert to project members when a sprint starts
 * - SPRINT_COMPLETED: alert to project members when a sprint completes
 */
export enum NotificationType {
  TASK_ASSIGNED = 'TaskAssigned',
  STATUS_CHANGED = 'StatusChanged',
  DEADLINE_URGENT = 'DeadlineUrgent',
  COMMENT = 'Comment',
  SPRINT_STARTED = 'SprintStarted',
  SPRINT_COMPLETED = 'SprintCompleted',
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
  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'User' })
  recipient: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Task' })
  task?: Types.ObjectId;

  /**
   * Optional reference to the Comment that triggered this notification
   * (set for COMMENT notifications). Lets the UI deep-link into the exact
   * comment context instead of just the task.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Comment' })
  comment?: Types.ObjectId;

  /**
   * The user whose action triggered this alert — the assigner, the status
   * changer, or the commenter. Absent for system-generated alerts (e.g.
   * the deadline-urgent cron). Lets the UI say "who did this" without
   * re-deriving it from the message text.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  sender?: Types.ObjectId;

  /**
   * Optional reference to the Sprint that triggered this notification
   * (set for SPRINT_STARTED / SPRINT_COMPLETED alerts). Lets the UI
   * deep-link into the sprint context instead of just the message text.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Sprint' })
  sprint?: Types.ObjectId;

  @Prop({ default: false })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
