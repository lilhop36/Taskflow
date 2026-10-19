import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { ProjectsRepository } from '../projects/projects.repository';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  UpdateTaskStatusDto,
  VALID_TRANSITIONS,
} from './dto/update-task-status.dto';
import { TasksRepository } from './tasks.repository';
import { Task, TaskStatus } from './schemas/task.schema';
import { TaskAssignedEvent } from '../notifications/events/task-assigned.event';
import { TaskStatusChangedEvent } from '../notifications/events/task-status-changed.event';
import { TaskDeadlineUrgentEvent } from '../notifications/events/task-deadline-urgent.event';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly usersService: UsersService,
    private readonly visibilityPolicy: VisibilityPolicyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * FR-008.3: Emits a "deadline urgent" event for an incomplete task whose
   * due date is within 24 hours. The NotificationListener reacts and
   * creates a DeadlineUrgent notification for the assignee.
   *
   * Also records deadlineUrgentNotifiedAt on the task so the hourly
   * DeadlineUrgentCron doesn't re-alert the same deadline on later scans.
   *
   * Single source of truth for the urgent alert — shared by the create/
   * update emit paths and the DeadlineUrgentCron, so every alert path
   * computes hoursRemaining identically.
   */
  async notifyUrgentDeadlineIfDue(
    taskId: string,
    taskTitle: string,
    assigneeId: string | null | undefined,
    status: TaskStatus,
    dueDate: Date,
  ) {
    if (!assigneeId) return;
    if (status === TaskStatus.DONE) return;

    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const hoursRemaining = (due - now) / (1000 * 60 * 60);

    if (hoursRemaining > 0 && hoursRemaining <= 24) {
      this.eventEmitter.emit(
        TaskDeadlineUrgentEvent.eventName,
        new TaskDeadlineUrgentEvent(
          taskId,
          taskTitle,
          assigneeId,
          new Date(dueDate),
          Math.max(1, Math.round(hoursRemaining)),
        ),
      );
      await this.tasksRepository.markDeadlineUrgentNotified(taskId);
    }
  }

  async create(createTaskDto: CreateTaskDto, actorId: string) {
    const project = await this.projectsRepository.findById(
      createTaskDto.project,
    );
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const assignee = await this.usersService.findById(createTaskDto.assignee);
    if (!assignee) {
      throw new NotFoundException('Assignee user not found');
    }

    const memberIds = [project.ownerId, ...project.memberIds];

    if (!memberIds.includes(createTaskDto.assignee)) {
      throw new BadRequestException(
        'Task can only be assigned to users who are members of the project',
      );
    }

    const dueDate = new Date(createTaskDto.dueDate);
    if (dueDate < project.startDate || dueDate > project.endDate) {
      throw new BadRequestException(
        'Task due date must fall within the project start and end dates',
      );
    }

    const taskData: Partial<Task> = {
      title: createTaskDto.title,
      description: createTaskDto.description,
      priority: createTaskDto.priority,
      dueDate,
      project: new Types.ObjectId(createTaskDto.project),
      assignee: new Types.ObjectId(createTaskDto.assignee),
      // The authenticated creator is always known (controller resolves it)
      createdBy: new Types.ObjectId(actorId),
    };

    const task = await this.tasksRepository.create(taskData);

    // FR-008.1: Notify the assignee when a task is assigned to them.
    // assignedBy = the authenticated actor — every user-triggered assignment
    // notification carries a real sender.
    this.eventEmitter.emit(
      TaskAssignedEvent.eventName,
      new TaskAssignedEvent(
        task._id.toString(),
        createTaskDto.assignee,
        createTaskDto.title,
        actorId,
      ),
    );

    // FR-008.3: Emit deadline-urgent if due date is within 24 hours.
    // task.assigneeId is the stable id shape — populated or raw ObjectId.
    await this.notifyUrgentDeadlineIfDue(
      task._id.toString(),
      task.title,
      task.assigneeId,
      task.status,
      task.dueDate,
    );

    return task.toObject();
  }

  /**
   * Lists tasks scoped to the caller: Admins/PMs see everything, Team
   * Members only the tasks in projects they belong to. The scoping
   * decision is delegated to the single shared visibility policy.
   */
  async findAll(user?: { _id: { toString(): string }; role?: UserRole }) {
    const projectIds = await this.visibilityPolicy.visibleProjectIds(user);
    const tasks =
      projectIds === null
        ? await this.tasksRepository.findAll()
        : await this.tasksRepository.findByProjectIds(projectIds);
    return tasks.map((t) => t.toObject());
  }

  async findById(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task.toObject();
  }

  async findByProject(
    projectId: string,
    user?: { _id: { toString(): string }; role?: UserRole },
  ) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Gate with the single shared visibility policy — Admins/PMs bypass via
    // BR-001 hierarchy, Team Members must be owner or member (BR-003).
    const isMember = await this.visibilityPolicy.canReadProject(
      user,
      projectId,
    );
    // A Team Member asking for a project they don't belong to gets an
    // empty list — the project simply has no visible tasks for them.
    if (!isMember) {
      return [];
    }

    const tasks = await this.tasksRepository.findByProject(projectId);
    return tasks.map((t) => t.toObject());
  }

  async findByAssignee(
    userId: string,
    user?: { _id: { toString(): string }; role?: UserRole },
  ) {
    const projectIds = await this.visibilityPolicy.visibleProjectIds(user);
    const tasks =
      projectIds === null
        ? await this.tasksRepository.findByAssignee(userId)
        : await this.tasksRepository.findByAssigneeInProjects(
            userId,
            projectIds,
          );
    return tasks.map((t) => t.toObject());
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, actorId: string) {
    await this.findById(id);

    // FR-008.1: Track the previous assignee so we only notify on a real reassignment
    let previousAssigneeId: string | undefined;
    let assigneeChanged = false;

    if (updateTaskDto.assignee) {
      const task = await this.tasksRepository.findById(id);
      if (task) {
        // findById populates assignee → use the stable assigneeId shape
        previousAssigneeId = task.assigneeId ?? undefined;
        assigneeChanged = updateTaskDto.assignee !== previousAssigneeId;
        const project = await this.projectsRepository.findById(
          task.project.toString(),
        );
        if (project) {
          const memberIds = [project.ownerId, ...project.memberIds];
          if (!memberIds.includes(updateTaskDto.assignee)) {
            throw new BadRequestException(
              'Task can only be assigned to users who are members of the project',
            );
          }
        }
      }
    }

    // Only treat the due date as changed when the timestamp actually differs
    // — a no-op PATCH must not reset the deadline-urgent dedup flag.
    let dueDateChanged = false;
    if (updateTaskDto.dueDate) {
      const task = await this.tasksRepository.findById(id);
      if (task) {
        dueDateChanged =
          new Date(updateTaskDto.dueDate).getTime() !=
          new Date(task.dueDate).getTime();
        const project = await this.projectsRepository.findById(
          task.project.toString(),
        );
        if (project) {
          const dueDate = new Date(updateTaskDto.dueDate);
          if (dueDate < project.startDate || dueDate > project.endDate) {
            throw new BadRequestException(
              'Task due date must fall within the project start and end dates',
            );
          }
        }
      }
    }

    // Plain-object update payload: `dueDate` arrives as an ISO string in the
    // DTO and is converted to Date below.
    const updateData = { ...updateTaskDto } as Partial<Task>;
    if (updateTaskDto.dueDate && dueDateChanged) {
      updateData.dueDate = new Date(updateTaskDto.dueDate);
      // The old deadline's alert is stale — the new due date may need a
      // fresh urgent alert (or none at all) when it enters the 24h window.
      updateData.deadlineUrgentNotifiedAt = null;
    }
    if (updateTaskDto.assignee) {
      updateData.assignee = new Types.ObjectId(updateTaskDto.assignee);
      // The new assignee inherits the deadline — reset the alert so they
      // get their own urgent notification if it's within 24h (FR-008.3).
      if (assigneeChanged) {
        updateData.deadlineUrgentNotifiedAt = null;
      }
    }

    const updated = await this.tasksRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // FR-008.1: Notify the new assignee when a task is reassigned, and
    // re-alert them on the deadline if it's within 24h (FR-008.3).
    if (updateTaskDto.assignee && assigneeChanged) {
      // The authenticated actor reassigned the task — the event carries
      // assignedBy = actorId so the notification has a real sender.
      this.eventEmitter.emit(
        TaskAssignedEvent.eventName,
        new TaskAssignedEvent(
          id,
          updateTaskDto.assignee,
          updated.title,
          actorId,
        ),
      );
      await this.notifyUrgentDeadlineIfDue(
        updated._id.toString(),
        updated.title,
        updated.assigneeId,
        updated.status,
        updated.dueDate,
      );
    }

    // FR-008.3: Re-check deadline urgency if due date changed
    if (updateTaskDto.dueDate && dueDateChanged) {
      await this.notifyUrgentDeadlineIfDue(
        updated._id.toString(),
        updated.title,
        updated.assigneeId,
        updated.status,
        updated.dueDate,
      );
    }

    return updated.toObject();
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateTaskStatusDto,
    actorId: string,
  ) {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const currentStatus = task.status;
    const newStatus = updateStatusDto.status;

    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition task from "${currentStatus}" to "${newStatus}". ` +
          `Allowed transitions from "${currentStatus}": ${allowedTransitions.join(', ')}`,
      );
    }

    // FR-009.2: record the true completion time (updatedAt is unreliable —
    // it changes on any edit, not just completion). Cleared when reopened.
    const updateData: Partial<Task> = { status: newStatus };
    updateData.completedAt = newStatus === TaskStatus.DONE ? new Date() : null;

    // When a completed task is reopened, its previous deadline-urgent alert
    // is stale — clear the flag so a fresh alert can fire (FR-008.3).
    if (currentStatus === TaskStatus.DONE && newStatus !== TaskStatus.DONE) {
      updateData.deadlineUrgentNotifiedAt = null;
    }

    const updated = await this.tasksRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // FR-008.2: Notify the assignee when the task status changes.
    // findById populates assignee → use the stable assigneeId shape.
    const assigneeId = task.assigneeId;
    if (assigneeId) {
      // The authenticated actor changed the status — the event carries
      // changedBy = actorId so the notification has a real sender.
      this.eventEmitter.emit(
        TaskStatusChangedEvent.eventName,
        new TaskStatusChangedEvent(
          id,
          assigneeId,
          task.title,
          currentStatus,
          newStatus,
          actorId,
        ),
      );
    }

    return updated.toObject();
  }
}
