import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsRepository } from '../notifications.repository';
import { NotificationType } from '../schemas/notification.schema';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskStatusChangedEvent } from '../events/task-status-changed.event';
import { CommentCreatedEvent } from '../events/comment-created.event';
import { TaskDeadlineUrgentEvent } from '../events/task-deadline-urgent.event';

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
  @OnEvent(TaskAssignedEvent.eventName)
  async handleTaskAssigned(event: TaskAssignedEvent) {
    await this.notificationsRepository.create({
      recipient: event.assigneeId,
      type: NotificationType.TASK_ASSIGNED,
      message: `You have been assigned to task: "${event.taskTitle}"`,
      task: event.taskId,
      sender: event.assignedBy,
    });
  }

  /**
   * Handles TaskStatusChangedEvent → creates a "StatusChanged" notification.
   *
   * FR-008.2: "The system shall notify assigned users when a task
   * status changes."
   */
  @OnEvent(TaskStatusChangedEvent.eventName)
  async handleTaskStatusChanged(event: TaskStatusChangedEvent) {
    await this.notificationsRepository.create({
      recipient: event.assigneeId,
      type: NotificationType.STATUS_CHANGED,
      message: `Task "${event.taskTitle}" moved from ${event.oldStatus} to ${event.newStatus}`,
      task: event.taskId,
      sender: event.changedBy,
    });
  }

  /**
   * Handles CommentCreatedEvent → notifies the task assignee and, for
   * replies, the author of the parent comment.
   *
   * Threaded comments:
   * - A new comment notifies the task assignee.
   * - A reply additionally notifies the original comment author.
   * - Self-notifications are always skipped: nobody is alerted about
   *   their own action (commenting on their own task, replying to
   *   their own comment).
   * - Recipients are deduped — if the assignee and the parent author
   *   are the same person, only one notification is created (the more
   *   specific reply message wins).
   */
  @OnEvent(CommentCreatedEvent.eventName)
  async handleCommentCreated(event: CommentCreatedEvent) {
    // recipientId -> message (Map dedupes; set() overwrites with the
    // more specific reply message when the same user fills both roles)
    const recipients = new Map<string, string>();

    // Notify the task assignee of the new comment (skip self / no assignee).
    // The message names the commenter (e.g. "Hanna Girma commented on task…").
    if (event.assigneeId && event.assigneeId !== event.authorId) {
      recipients.set(
        event.assigneeId,
        `${event.authorName ?? 'Someone'} commented on task "${event.taskTitle}"`,
      );
    } // Notify the parent comment's author when this is a reply
    // (skip self: replying to your own comment needs no alert). The message
    // names the replier (e.g. "Liya replied to your comment…").
    if (
      event.replyTo &&
      event.parentAuthorId &&
      event.parentAuthorId !== event.authorId
    ) {
      recipients.set(
        event.parentAuthorId,
        `${event.authorName ?? 'Someone'} replied to your comment on task "${event.taskTitle}"`,
      );
    }

    for (const [recipient, message] of recipients) {
      await this.notificationsRepository.create({
        recipient,
        type: NotificationType.COMMENT,
        message,
        task: event.taskId,
        comment: event.commentId,
        sender: event.authorId,
      });
    }
  }

  /**
   * Handles TaskDeadlineUrgentEvent → creates a "DeadlineUrgent" notification.
   *
   * FR-008.3: "The system shall automatically trigger an urgent deadline
   * alert to the assignee when an incomplete task is within 24 hours of
   * its due date."
   */
  @OnEvent(TaskDeadlineUrgentEvent.eventName)
  async handleTaskDeadlineUrgent(event: TaskDeadlineUrgentEvent) {
    // System-generated alert (cron) — no sender to attribute.
    await this.notificationsRepository.create({
      recipient: event.assigneeId,
      type: NotificationType.DEADLINE_URGENT,
      message: `URGENT: Task "${event.taskTitle}" is due in ${event.hoursRemaining} hour(s)`,
      task: event.taskId,
    });
  }

  /**
   * Handles the sprint.started event → notifies every project member
   * except the actor who started it. Deep-links into the sprint.
   */
  @OnEvent('sprint.started')
  async handleSprintStarted(event: {
    actorId: string;
    sprintId: string;
    sprintName: string;
    projectId: string;
    memberIds: string[];
  }) {
    for (const memberId of event.memberIds) {
      if (memberId === event.actorId) continue;
      await this.notificationsRepository.create({
        recipient: memberId,
        type: NotificationType.SPRINT_STARTED,
        message: `Sprint "${event.sprintName}" has started`,
        sprint: event.sprintId,
        sender: event.actorId,
      });
    }
  }

  /**
   * Handles the sprint.completed event → notifies every project member
   * with a summary of how many tasks were delivered. Self-actor excluded.
   */
  @OnEvent('sprint.completed')
  async handleSprintCompleted(event: {
    actorId: string;
    sprintId: string;
    sprintName: string;
    projectId: string;
    memberIds: string[];
    totalTasks: number;
    completedTasks: number;
  }) {
    for (const memberId of event.memberIds) {
      if (memberId === event.actorId) continue;
      await this.notificationsRepository.create({
        recipient: memberId,
        type: NotificationType.SPRINT_COMPLETED,
        message: `Sprint "${event.sprintName}" completed with ${event.completedTasks}/${event.totalTasks} tasks done`,
        sprint: event.sprintId,
        sender: event.actorId,
      });
    }
  }
}
