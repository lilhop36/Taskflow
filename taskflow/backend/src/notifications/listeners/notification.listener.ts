import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsRepository } from '../notifications.repository';
import { NotificationType } from '../schemas/notification.schema';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskStatusChangedEvent } from '../events/task-status-changed.event';
import { CommentCreatedEvent } from '../events/comment-created.event';

/**
 * Listens for domain events and creates notification records.
 *
 * This class decouples the "core" modules (Tasks, Comments) from the
 * Notification module via the EventEmitter. The tasks/comments services
 * emit events; this listener reacts by persisting a notification.
 *
 * Benefits:
 * - Core services don't import NotificationService → no circular deps
 * - Can add additional channels later (e.g. email, WebSocket) without
 *   modifying the core business logic.
 *
 * SRS: FR-008.1-4
 */
@Injectable()
export class NotificationListener {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  /**
   * Handles TaskAssignedEvent → creates a "TaskAssigned" notification.
   *
   * FR-008.1: "The system shall automatically notify the user when a
   * task is assigned to them."
   */
  @OnEvent('task.assigned')
  async handleTaskAssigned(event: TaskAssignedEvent) {
    await this.notificationsRepository.create({
      recipient: event.assigneeId as any,
      type: NotificationType.TASK_ASSIGNED,
      message: `You have been assigned to task: "${event.taskTitle}"`,
      task: event.taskId as any,
    });
  }

  /**
   * Handles TaskStatusChangedEvent → creates a "StatusChanged" notification.
   *
   * FR-008.2: "The system shall notify assigned users when a task
   * status changes."
   */
  @OnEvent('task.status-changed')
  async handleTaskStatusChanged(event: TaskStatusChangedEvent) {
    await this.notificationsRepository.create({
      recipient: event.assigneeId as any,
      type: NotificationType.STATUS_CHANGED,
      message: `Task "${event.taskTitle}" moved from ${event.oldStatus} to ${event.newStatus}`,
      task: event.taskId as any,
    });
  }

  /**
   * Handles CommentCreatedEvent → notifies the task assignee.
   *
   * Skips self-notifications: you don't need an alert when you
   * comment on your own task.
   */
  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent) {
    // No assignee → nowhere to send the notification
    if (!event.assigneeId) return;

    // Skip self-notifications
    if (event.assigneeId === event.authorId) return;

    await this.notificationsRepository.create({
      recipient: event.assigneeId as any,
      type: NotificationType.STATUS_CHANGED,
      message: `New comment on task "${event.taskTitle}"`,
      task: event.taskId as any,
    });
  }
}
