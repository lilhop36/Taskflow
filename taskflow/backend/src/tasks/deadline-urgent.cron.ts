import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

const HOUR_MS = 1000 * 60 * 60;

/**
 * Scheduled scan for urgent task deadlines.
 *
 * FR-008.3: "The system shall automatically trigger an urgent deadline
 * alert to the assignee when an incomplete task is within 24 hours of its
 * due date."
 *
 * The create/update emit paths in TasksService only alert at the moment a
 * task is created or edited — a task created weeks out would never alert
 * on its own. This cron closes that gap: every hour it finds incomplete
 * tasks due within the next 24 hours that haven't been alerted yet and
 * delegates each to TasksService.notifyUrgentDeadlineIfDue, which emits
 * the `task.deadline-urgent` event the NotificationListener already
 * handles and sets the dedup flag.
 *
 * Dedup: the `deadlineUrgentNotifiedAt` flag on the Task is set right after
 * emitting, so each deadline triggers exactly one notification — even if
 * the task stays in the 24-hour window across multiple hourly scans.
 */
@Injectable()
export class DeadlineUrgentCron {
  private readonly logger = new Logger(DeadlineUrgentCron.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scanForUrgentDeadlines() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * HOUR_MS);

    const tasks = await this.tasksRepository.findDueWithin(now, in24Hours);

    for (const task of tasks) {
      await this.tasksService.notifyUrgentDeadlineIfDue(
        task._id.toString(),
        task.title,
        task.assigneeId,
        task.status,
        task.dueDate,
      );
    }

    if (tasks.length > 0) {
      this.logger.log(
        `Deadline scan: alerted on ${tasks.length} task(s) due within 24 hours`,
      );
    }
  }
}
