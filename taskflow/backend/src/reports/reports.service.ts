import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
import { TaskStatus } from '../tasks/schemas/task.schema';

/**
 * Service — aggregation engine for all report data.
 *
 * SRS: FR-009.1-3
 * - Compiles live project tracking statistics (FR-009.1)
 * - Generates employee performance metrics (FR-009.2)
 * - No new database queries beyond Task + Project + User lookups
 *
 * All data is aggregated from existing repositories — no raw DB access.
 * Reports are returned as structured JSON objects (PDF formatting
 * is handled by the frontend or a future document-generation layer).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly tasksRepository: TasksRepository,
    private readonly usersService: UsersService,
  ) {}

  /**
   * FR-009.1: Project Status Report
   *
   * Compiles:
   * - Project identity (name, description, dates, status)
   * - Task distribution by status (To Do, In Progress, Done)
   * - Completion percentage
   * - Overdue task list (past due date, not Done)
   * - Time progress (elapsed vs total duration as percentage)
   * - Remaining workload count
   */
  async getProjectReport(projectId: string) {
    const project = await this.projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const tasks = await this.tasksRepository.findByProject(projectId);

    const totalTasks = tasks.length;
    const todoTasks = tasks.filter(
      (t) => t.status === TaskStatus.TODO,
    ).length;
    const inProgressTasks = tasks.filter(
      (t) => t.status === TaskStatus.IN_PROGRESS,
    ).length;
    const doneTasks = tasks.filter(
      (t) => t.status === TaskStatus.DONE,
    ).length;
    const completionPercent = totalTasks > 0
      ? Math.round((doneTasks / totalTasks) * 100)
      : 0;

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) => t.dueDate < now && t.status !== TaskStatus.DONE,
    ).map((t) => ({
      id: t._id.toString(),
      title: t.title,
      dueDate: t.dueDate,
      status: t.status,
      assignee: t.assignee?.toString(),
    }));

    // Time progress: how much of the project's planned duration has elapsed
    const totalDuration =
      project.endDate.getTime() - project.startDate.getTime();
    const elapsed =
      now.getTime() - project.startDate.getTime();
    const timeProgressPercent =
      totalDuration > 0
        ? Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)))
        : 0;

    return {
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        status: project.status,
        owner: project.owner?.toString(),
      },
      taskSummary: {
        total: totalTasks,
        todo: todoTasks,
        inProgress: inProgressTasks,
        done: doneTasks,
        completionPercent,
      },
      timeProgressPercent,
      overdueTasks,
      overdueCount: overdueTasks.length,
      remainingWorkload: totalTasks - doneTasks,
    };
  }

  /**
   * FR-009.2: Employee Performance Report
   *
   * Compiles:
   * - User identity (name, email, role)
   * - Tasks completed on time (Done before or on due date)
   * - Tasks completed late (Done after due date)
   * - Active workload (not Done, not overdue)
   * - Overdue items (not Done, past due date)
   * - Historically missed deadlines count
   */
  async getEmployeeReport(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const tasks = await this.tasksRepository.findByAssignee(userId);

    const totalAssigned = tasks.length;
    const now = new Date();

    // completedAt is set when the task transitions to Done (FR-009.2).
    // Fall back to updatedAt only for legacy tasks created before the
    // field existed — updatedAt otherwise changes on any edit.
    const completionTime = (t: any) =>
      t.completedAt || t.updatedAt || t.createdAt;

    const completedOnTime = tasks.filter(
      (t) => t.status === TaskStatus.DONE && t.dueDate >= completionTime(t),
    );
    const completedLate = tasks.filter(
      (t) => t.status === TaskStatus.DONE && t.dueDate < completionTime(t),
    );
    const activeWorkload = tasks.filter(
      (t) => t.status !== TaskStatus.DONE && t.dueDate >= now,
    );
    const overdueItems = tasks.filter(
      (t) => t.status !== TaskStatus.DONE && t.dueDate < now,
    );

    return {
      employee: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      taskSummary: {
        totalAssigned,
        completedOnTime: completedOnTime.length,
        completedLate: completedLate.length,
        activeWorkload: activeWorkload.length,
        overdue: overdueItems.length,
      },
      overdueTasks: overdueItems.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        project: t.project?.toString(),
      })),
      performanceMetrics: {
        onTimeRate:
          completedOnTime.length + completedLate.length > 0
            ? Math.round(
                (completedOnTime.length / (completedOnTime.length + completedLate.length)) * 100,
              )
            : totalAssigned > 0 ? 0 : null,
        missedDeadlines: completedLate.length,
      },
    };
  }
}
