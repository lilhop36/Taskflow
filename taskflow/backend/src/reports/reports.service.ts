import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ProjectsRepository } from '../projects/projects.repository';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
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
    private readonly visibilityPolicy: VisibilityPolicyService,
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
    const todoTasks = tasks.filter((t) => t.status === TaskStatus.TODO).length;
    const inProgressTasks = tasks.filter(
      (t) => t.status === TaskStatus.IN_PROGRESS,
    ).length;
    const doneTasks = tasks.filter((t) => t.status === TaskStatus.DONE).length;
    const completionPercent =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const now = new Date();
    const overdueTasks = tasks
      .filter((t) => t.dueDate < now && t.status !== TaskStatus.DONE)
      .map((t) => ({
        id: t._id.toString(),
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        // assignee is the stable id shape — populated or raw ObjectId.
        // (assignee is required on tasks, so this serializes null only in the
        // impossible missing-assignee case, where the old ?? chain emitted
        // undefined — an equivalent omission.)
        assignee: t.assigneeId,
      }));

    // Time progress: how much of the project's planned duration has elapsed
    const totalDuration =
      project.endDate.getTime() - project.startDate.getTime();
    const elapsed = now.getTime() - project.startDate.getTime();
    const timeProgressPercent =
      totalDuration > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((elapsed / totalDuration) * 100)),
          )
        : 0;

    return {
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        status: project.status,
        // findById populates owner — use the stable ownerId shape
        owner: project.ownerId,
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
   * FR-006: Dashboard aggregate (completion %, status distribution, overdue).
   *
   * Serves the Dashboard page with a single request — no more downloading
   * every project and task to compute stats in the browser. Optionally
   * scoped to one project via `projectId`.
   *
   * Visibility mirrors the task/project read scoping: Admins and Project
   * Managers (BR-001) see everything; Team Members only their own projects.
   */
  async getDashboard(
    user?: { _id: { toString(): string }; role?: UserRole },
    projectId?: string,
  ) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    // Single shared visibility policy — the same BR-001/BR-003 rule the
    // projects/tasks read endpoints use.
    let projects: { _id: Types.ObjectId; name: string }[];
    if (projectId) {
      // Single-project view — must exist and be visible to the caller.
      const project = await this.projectsRepository.findById(projectId);
      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }
      const isMember = await this.visibilityPolicy.canReadProject(
        user,
        projectId,
      );
      if (!isMember) {
        throw new ForbiddenException(
          'You must be a member of the project to view it',
        );
      }
      projects = [{ _id: project._id, name: project.name }];
    } else {
      // All-projects view — scoped to membership for Team Members.
      // null from the policy means full visibility (Admins/PMs) — then list
      // every project (findIdNameForMember with no user id).
      projects =
        (await this.visibilityPolicy.visibleProjectIdNames(user)) ??
        (await this.projectsRepository.findIdNameForMember(undefined));
    }

    const projectIds = projects.map((p) => p._id);
    const tasks =
      projectIds.length > 0
        ? await this.tasksRepository.findForDashboard(projectIds)
        : [];

    const now = new Date();
    const distribution = { todo: 0, inProgress: 0, done: 0 };
    const overdueTasks: {
      id: string;
      title: string;
      dueDate: Date;
      status: TaskStatus;
      project: string;
    }[] = [];

    for (const task of tasks) {
      if (task.status === TaskStatus.DONE) {
        distribution.done += 1;
      } else if (task.status === TaskStatus.IN_PROGRESS) {
        distribution.inProgress += 1;
      } else {
        distribution.todo += 1;
      }

      if (task.status !== TaskStatus.DONE && task.dueDate < now) {
        overdueTasks.push({
          id: task._id.toString(),
          title: task.title,
          dueDate: task.dueDate,
          status: task.status,
          project: task.project.toString(),
        });
      }
    }

    const total = tasks.length;
    const completionPercent =
      total > 0 ? Math.round((distribution.done / total) * 100) : 0;

    return {
      projects: projects.map((p) => ({ _id: p._id.toString(), name: p.name })),
      summary: {
        total,
        done: distribution.done,
        completionPercent,
        // Full count for the stat card; the list below is capped.
        overdueCount: overdueTasks.length,
      },
      distribution,
      // The Dashboard renders the first 10 — don't ship every overdue task
      // at the SRS's 10K-task scale.
      overdueTasks: overdueTasks.slice(0, 10),
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
                (completedOnTime.length /
                  (completedOnTime.length + completedLate.length)) *
                  100,
              )
            : totalAssigned > 0
              ? 0
              : null,
        missedDeadlines: completedLate.length,
      },
    };
  }
}
