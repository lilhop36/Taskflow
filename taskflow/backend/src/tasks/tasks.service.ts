import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { ProjectsRepository } from '../projects/projects.repository';
import { UsersService } from '../users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto, VALID_TRANSITIONS } from './dto/update-task-status.dto';
import { TasksRepository } from './tasks.repository';
import { TaskStatus } from './schemas/task.schema';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * FR-008.3: Emits a "deadline urgent" event for an incomplete task whose
   * due date is within 24 hours. The NotificationListener reacts and
   * creates a DeadlineUrgent notification for the assignee.
   */
  private maybeEmitDeadlineUrgent(
    taskId: string,
    taskTitle: string,
    assigneeId: string | undefined,
    status: TaskStatus,
    dueDate: Date,
  ) {
    if (!assigneeId) return;
    if (status === TaskStatus.DONE) return;

    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const hoursRemaining = (due - now) / (1000 * 60 * 60);

    if (hoursRemaining > 0 && hoursRemaining <= 24) {
      this.eventEmitter.emit('task.deadline-urgent', {
        taskId,
        taskTitle,
        assigneeId,
        dueDate: new Date(dueDate),
        hoursRemaining: Math.round(hoursRemaining),
      });
    }
  }

  async create(createTaskDto: CreateTaskDto, currentUserId?: string) {
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

    const memberIds = [
      project.owner._id.toString(),
      ...project.members.map((m: any) => m._id?.toString() ?? m.toString()),
    ];

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

    const taskData: any = {
      title: createTaskDto.title,
      description: createTaskDto.description,
      priority: createTaskDto.priority,
      dueDate,
      project: new Types.ObjectId(createTaskDto.project),
      assignee: new Types.ObjectId(createTaskDto.assignee),
    };
    if (currentUserId) {
      taskData.createdBy = new Types.ObjectId(currentUserId);
    }

    const task = await this.tasksRepository.create(taskData);

    // FR-008.1: Notify the assignee when a task is assigned to them
    this.eventEmitter.emit('task.assigned', {
      taskId: task._id.toString(),
      assigneeId: createTaskDto.assignee,
      taskTitle: createTaskDto.title,
      assignedBy: currentUserId ?? 'system',
    });

    // FR-008.3: Emit deadline-urgent if due date is within 24 hours
    this.maybeEmitDeadlineUrgent(
      task._id.toString(),
      task.title,
      task.assignee?.toString(),
      task.status,
      task.dueDate,
    );

    return task.toObject();
  }

  async findAll() {
    const tasks = await this.tasksRepository.findAll();
    return tasks.map((t) => t.toObject());
  }

  async findById(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task.toObject();
  }

  async findByProject(projectId: string) {
    const tasks = await this.tasksRepository.findByProject(projectId);
    return tasks.map((t) => t.toObject());
  }

  async findByAssignee(userId: string) {
    const tasks = await this.tasksRepository.findByAssignee(userId);
    return tasks.map((t) => t.toObject());
  }

  async update(id: string, updateTaskDto: UpdateTaskDto) {
    await this.findById(id);

    if (updateTaskDto.assignee) {
      const task = await this.tasksRepository.findById(id);
      if (task) {
        const project = await this.projectsRepository.findById(
          task.project.toString(),
        );
        if (project) {
          const memberIds = [
            project.owner._id.toString(),
            ...project.members.map((m: any) =>
              m._id?.toString() ?? m.toString(),
            ),
          ];
          if (!memberIds.includes(updateTaskDto.assignee)) {
            throw new BadRequestException(
              'Task can only be assigned to users who are members of the project',
            );
          }
        }
      }
    }

    if (updateTaskDto.dueDate) {
      const task = await this.tasksRepository.findById(id);
      if (task) {
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

    const updateData: any = { ...updateTaskDto };
    if (updateTaskDto.dueDate) {
      updateData.dueDate = new Date(updateTaskDto.dueDate);
    }
    if (updateTaskDto.assignee) {
      updateData.assignee = new Types.ObjectId(updateTaskDto.assignee);
    }

    const updated = await this.tasksRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // FR-008.3: Re-check deadline urgency if due date changed
    if (updateTaskDto.dueDate) {
      this.maybeEmitDeadlineUrgent(
        updated._id.toString(),
        updated.title,
        updated.assignee?.toString(),
        updated.status,
        updated.dueDate,
      );
    }

    return updated.toObject();
  }

  async updateStatus(id: string, updateStatusDto: UpdateTaskStatusDto) {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const currentStatus = task.status as TaskStatus;
    const newStatus = updateStatusDto.status;

    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition task from "${currentStatus}" to "${newStatus}". ` +
        `Allowed transitions from "${currentStatus}": ${allowedTransitions.join(', ')}`,
      );
    }

    const updated = await this.tasksRepository.update(id, {
      status: newStatus,
    });
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // FR-008.2: Notify the assignee when the task status changes
    const assigneeId = task.assignee?.toString();
    if (assigneeId) {
      this.eventEmitter.emit('task.status-changed', {
        taskId: id,
        assigneeId,
        taskTitle: task.title,
        oldStatus: currentStatus,
        newStatus,
        changedBy: 'system',
      });
    }

    return updated.toObject();
  }
}
