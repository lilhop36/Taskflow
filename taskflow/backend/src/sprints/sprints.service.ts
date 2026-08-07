import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/schemas/activity.schema';
import { ProjectsRepository } from '../projects/projects.repository';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Task, TaskDocument, TaskStatus } from '../tasks/schemas/task.schema';
import { UserRole } from '../users/schemas/user.schema';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { Sprint, SprintDocument, SprintStatus } from './schemas/sprint.schema';
import { SprintsRepository } from './sprints.repository';
import type { SprintWithStats } from './sprints.repository';

type SprintWithStatsView = Omit<SprintWithStats, 'project'> & {
  project: { _id: Types.ObjectId; name: string };
};

const DONE = TaskStatus.DONE;
const ARCHIVED = TaskStatus.ARCHIVED;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SprintsService {
  constructor(
    private readonly sprintsRepository: SprintsRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly activityService: ActivityService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private projectIdOf(sprint: SprintDocument): string {
    return (sprint.project?._id ?? sprint.project)?.toString();
  }

  private async getSprintOrThrow(id: string) {
    const sprint = await this.sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }
    return sprint;
  }

  /** Public read access: only project members (or admins) may see a sprint. */
  private async assertReadAccess(
    id: string,
    actorId: string,
    actorRole: UserRole,
  ) {
    const sprint = await this.getSprintOrThrow(id);
    if (actorRole !== UserRole.ADMIN) {
      const projectId = this.projectIdOf(sprint);
      const isMember = await this.projectsRepository.isUserMemberOfProject(
        actorId,
        projectId,
      );
      if (!isMember) {
        throw new NotFoundException(`Sprint with ID ${id} not found`);
      }
    }
    return sprint;
  }

  private async assertProjectAccess(
    projectId: string,
    actorId: string,
    actorRole: UserRole,
  ) {
    if (actorRole === UserRole.ADMIN) return;
    const isMember = await this.projectsRepository.isUserMemberOfProject(
      actorId,
      projectId,
    );
    if (!isMember) {
      throw new NotFoundException('Project not found');
    }
  }

  private validateDates(
    startDate: Date,
    endDate: Date,
    project: { startDate: Date; endDate: Date },
  ) {
    if (endDate <= startDate) {
      throw new BadRequestException(
        'Sprint end date must be after the start date',
      );
    }
    if (startDate < project.startDate) {
      throw new BadRequestException(
        'Sprint start date cannot be before the project start date',
      );
    }
    if (endDate > project.endDate) {
      throw new BadRequestException(
        'Sprint end date cannot be after the project end date',
      );
    }
  }

  private async sprintTasks(sprintId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ sprintId: new Types.ObjectId(sprintId) })
      .populate('assignee', 'firstName lastName email avatar')
      .populate('project', 'name')
      .exec();
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async create(
    createSprintDto: CreateSprintDto,
    currentUserId: string,
    userRole: UserRole,
  ) {
    const project = await this.projectModel.findById(createSprintDto.project);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.assertProjectAccess(
      createSprintDto.project,
      currentUserId,
      userRole,
    );

    const startDate = new Date(createSprintDto.startDate);
    const endDate = new Date(createSprintDto.endDate);
    this.validateDates(startDate, endDate, project);

    const sprint = await this.sprintsRepository.create({
      name: createSprintDto.name,
      goal: createSprintDto.goal ?? '',
      project: new Types.ObjectId(createSprintDto.project),
      startDate,
      endDate,
      createdBy: new Types.ObjectId(currentUserId),
    });

    await this.activityService.create({
      type: ActivityType.SPRINT_CREATED,
      actor: currentUserId,
      description: `Created sprint "${sprint.name}" for project "${project.name}"`,
      project: project._id.toString(),
      sprint: sprint._id.toString(),
    });

    this.eventEmitter.emit('sprint.created', {
      actorId: currentUserId,
      sprintId: sprint._id.toString(),
      sprintName: sprint.name,
      projectId: project._id.toString(),
      projectName: project.name,
    });

    return this.findById(sprint._id.toString(), currentUserId, userRole);
  }

  async findAll(
    projectId: string | undefined,
    actor: { id: string; role: UserRole },
  ) {
    if (projectId) {
      await this.assertProjectAccess(projectId, actor.id, actor.role);
      return this.sprintsRepository.findByProject(projectId);
    }

    const projects =
      actor.role === UserRole.TEAM_MEMBER
        ? (await this.projectModel.find()).filter((p) =>
            p.members.map((m) => m.toString()).includes(actor.id),
          )
        : await this.projectModel.find();

    const results: SprintWithStats[] = [];
    for (const p of projects) {
      results.push(
        ...(await this.sprintsRepository.findByProject(p._id.toString())),
      );
    }
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return results;
  }

  async findById(id: string, actorId?: string, actorRole?: UserRole) {
    const sprint = await this.getSprintOrThrow(id);
    if (actorId && actorRole && actorRole !== UserRole.ADMIN) {
      await this.assertProjectAccess(
        this.projectIdOf(sprint),
        actorId,
        actorRole,
      );
    }

    const result: SprintWithStatsView =
      sprint.toObject() as unknown as SprintWithStatsView;
    const tasks = await this.sprintTasks(id);
    result.taskCount = tasks.length;
    result.completedCount = tasks.filter((t) => t.status === DONE).length;
    result.project = (await this.projectModel
      .findById(this.projectIdOf(sprint))
      .select('name description startDate endDate status')
      .exec()) as unknown as { _id: Types.ObjectId; name: string };
    return result;
  }

  async update(id: string, updateSprintDto: UpdateSprintDto, actorId: string) {
    const sprint = await this.getSprintOrThrow(id);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException(
        'Completed sprints cannot be edited. Create a new sprint instead.',
      );
    }
    if (
      sprint.status === SprintStatus.ACTIVE &&
      (updateSprintDto.startDate || updateSprintDto.endDate)
    ) {
      throw new BadRequestException(
        'Sprint dates cannot be changed after the sprint has started',
      );
    }

    const updateData: Partial<Sprint> = {};
    if (updateSprintDto.name !== undefined)
      updateData.name = updateSprintDto.name;
    if (updateSprintDto.goal !== undefined)
      updateData.goal = updateSprintDto.goal;
    if (updateSprintDto.startDate)
      updateData.startDate = new Date(updateSprintDto.startDate);
    if (updateSprintDto.endDate)
      updateData.endDate = new Date(updateSprintDto.endDate);

    if (updateSprintDto.startDate || updateSprintDto.endDate) {
      const startDate = updateData.startDate ?? sprint.startDate;
      const endDate = updateData.endDate ?? sprint.endDate;
      const project = await this.projectModel.findById(
        this.projectIdOf(sprint),
      );
      if (project) this.validateDates(startDate, endDate, project);
    }

    const updated = await this.sprintsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }

    await this.activityService.create({
      type: ActivityType.SPRINT_CREATED,
      actor: actorId,
      description: `Updated sprint "${updated.name}"`,
      project: this.projectIdOf(updated),
      sprint: id,
    });

    return updated.toObject();
  }

  async remove(id: string) {
    const sprint = await this.getSprintOrThrow(id);

    if (sprint.status === SprintStatus.ACTIVE) {
      throw new BadRequestException(
        'An active sprint cannot be deleted. Complete it first.',
      );
    }

    const result = await this.sprintsRepository.remove(id);
    if (!result) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }

    // Release this sprint's tasks back to the backlog
    await this.taskModel.updateMany(
      { sprintId: new Types.ObjectId(id) },
      { $set: { sprintId: null } },
    );

    return { message: 'Sprint deleted successfully', deletedId: id };
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  async start(id: string, actorId: string) {
    const sprint = await this.getSprintOrThrow(id);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException('A completed sprint cannot be restarted');
    }
    if (sprint.status === SprintStatus.ACTIVE) {
      throw new BadRequestException('This sprint is already active');
    }

    const projectId = this.projectIdOf(sprint);
    const existingActive = await this.sprintsRepository.findActiveByProject(
      projectId,
      id,
    );
    if (existingActive) {
      throw new BadRequestException(
        `There is already an active sprint "${existingActive.name}". Complete it before starting a new one.`,
      );
    }

    const started = await this.sprintsRepository.update(id, {
      status: SprintStatus.ACTIVE,
    });
    if (!started) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }

    await this.activityService.create({
      type: ActivityType.SPRINT_STARTED,
      actor: actorId,
      description: `Started sprint "${started.name}"`,
      project: projectId,
      sprint: id,
    });

    await this.emitSprintMemberEvent(
      'sprint.started',
      {
        sprintId: id,
        sprintName: started.name,
        projectId,
      },
      actorId,
    );

    return started.toObject();
  }

  async complete(id: string, actorId: string) {
    const sprint = await this.getSprintOrThrow(id);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException('This sprint is already completed');
    }
    if (sprint.status === SprintStatus.PLANNED) {
      throw new BadRequestException(
        'A sprint must be started before it can be completed',
      );
    }

    const projectId = this.projectIdOf(sprint);
    const tasks = await this.sprintTasks(id);
    const completedCount = tasks.filter((t) => t.status === DONE).length;

    const completed = await this.sprintsRepository.update(id, {
      status: SprintStatus.COMPLETED,
      completedAt: new Date(),
    });
    if (!completed) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }

    await this.activityService.create({
      type: ActivityType.SPRINT_COMPLETED,
      actor: actorId,
      description: `Completed sprint "${completed.name}" (${completedCount}/${tasks.length} tasks done)`,
      project: projectId,
      sprint: id,
    });

    await this.emitSprintMemberEvent(
      'sprint.completed',
      {
        sprintId: id,
        sprintName: completed.name,
        projectId,
        totalTasks: tasks.length,
        completedTasks: completedCount,
      },
      actorId,
    );

    return completed.toObject();
  }

  private async emitSprintMemberEvent(
    event: string,
    data: {
      sprintId: string;
      sprintName: string;
      projectId: string;
      totalTasks?: number;
      completedTasks?: number;
    },
    actorId: string,
  ) {
    const project = await this.projectModel.findById(data.projectId);
    const memberIds = project
      ? [
          ...new Set([
            project.owner.toString(),
            ...project.members.map((m) => m.toString()),
          ]),
        ]
      : [];

    this.eventEmitter.emit(event, {
      actorId,
      ...data,
      memberIds,
    });
  }

  // ------------------------------------------------------------------
  // Sprint tasks (board)
  // ------------------------------------------------------------------

  async addTasks(id: string, taskIds: string[], actorId: string) {
    const sprint = await this.getSprintOrThrow(id);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException(
        'Tasks cannot be added to a completed sprint',
      );
    }

    const projectId = this.projectIdOf(sprint);

    const tasks = await this.taskModel.find({
      _id: { $in: taskIds.map((t) => new Types.ObjectId(t)) },
    });
    if (tasks.length !== taskIds.length) {
      throw new BadRequestException('One or more tasks were not found');
    }

    for (const task of tasks) {
      if (task.project.toString() !== projectId) {
        throw new BadRequestException(
          `Task "${task.title}" does not belong to this sprint's project`,
        );
      }
    }

    await this.taskModel.updateMany(
      { _id: { $in: taskIds.map((t) => new Types.ObjectId(t)) } },
      { $set: { sprintId: new Types.ObjectId(id) } },
    );

    await this.activityService.create({
      type: ActivityType.SPRINT_CREATED,
      actor: actorId,
      description: `Added ${taskIds.length} task(s) to sprint "${sprint.name}"`,
      project: projectId,
      sprint: id,
    });

    return this.getBoard(id, actorId, UserRole.ADMIN);
  }

  async removeTask(sprintId: string, taskId: string, actorId: string) {
    const sprint = await this.getSprintOrThrow(sprintId);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException(
        'Tasks cannot be removed from a completed sprint',
      );
    }

    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.sprintId?.toString() !== sprintId) {
      throw new BadRequestException('Task is not part of this sprint');
    }

    await this.taskModel.findByIdAndUpdate(taskId, {
      $set: { sprintId: null },
    });

    return this.getBoard(sprintId, actorId, UserRole.ADMIN);
  }

  async getBoard(id: string, actorId: string, actorRole: UserRole) {
    await this.assertReadAccess(id, actorId, actorRole);

    const tasks = await this.sprintTasks(id);
    const columns = [
      TaskStatus.BACKLOG,
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
      TaskStatus.DONE,
    ];

    return columns.map((status) => ({
      status,
      tasks: tasks.filter((t) => t.status === status).map((t) => t.toObject()),
    }));
  }

  // ------------------------------------------------------------------
  // Analytics
  // ------------------------------------------------------------------

  async getBurndown(id: string, actorId: string, actorRole: UserRole) {
    await this.assertReadAccess(id, actorId, actorRole);

    const rawSprint = await this.sprintsRepository.findRawById(id);
    if (!rawSprint) {
      throw new NotFoundException(`Sprint with ID ${id} not found`);
    }

    const tasks = await this.sprintTasks(id);
    const notArchived = tasks.filter((t) => t.status !== ARCHIVED);
    const total = notArchived.length;
    const doneTasks = notArchived.filter((t) => t.status === DONE);

    const start = new Date(rawSprint.startDate);
    start.setHours(0, 0, 0, 0);

    const rawEnd = rawSprint.completedAt ?? Date.now();
    const cappedEnd = new Date(
      Math.min(
        new Date(rawEnd).getTime(),
        new Date(rawSprint.endDate).getTime(),
      ),
    );
    cappedEnd.setHours(23, 59, 59, 999);

    const totalDays = Math.max(
      1,
      Math.round(
        (new Date(rawSprint.endDate).getTime() - start.getTime()) / DAY_MS,
      ),
    );

    const days: { date: string; actual: number; ideal: number }[] = [];
    const cursor = new Date(start);

    while (cursor <= cappedEnd) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);

      const doneByEnd = doneTasks.filter((t) => {
        const timestamps = t as unknown as {
          completedAt?: Date;
          createdAt?: Date;
        };
        const completedAt = timestamps.completedAt;
        const createdAt = timestamps.createdAt;
        const ts = completedAt
          ? new Date(completedAt).getTime()
          : new Date(createdAt ?? 0).getTime();
        return ts <= dayEnd.getTime();
      }).length;

      const elapsedDays = Math.round(
        (dayEnd.getTime() - start.getTime()) / DAY_MS,
      );
      const idealRemaining = Math.round(
        total * (1 - Math.min(elapsedDays / totalDays, 1)),
      );

      days.push({
        date: cursor.toISOString().split('T')[0],
        actual: Math.max(0, total - doneByEnd),
        ideal: idealRemaining,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      sprintId: id,
      total,
      completed: doneTasks.length,
      startDate: rawSprint.startDate,
      endDate: rawSprint.endDate,
      days,
    };
  }

  async getReport(id: string, actorId: string, actorRole: UserRole) {
    const sprint = await this.assertReadAccess(id, actorId, actorRole);

    const projectId = this.projectIdOf(sprint);
    const tasks = await this.sprintTasks(id);
    const notArchived = tasks.filter((t) => t.status !== ARCHIVED);
    const total = notArchived.length;
    const done = notArchived.filter((t) => t.status === DONE).length;
    const now = new Date();

    const tasksByStatus = [
      TaskStatus.BACKLOG,
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
      TaskStatus.DONE,
    ].map((status) => ({
      status,
      count: notArchived.filter((t) => t.status === status).length,
    }));

    const completedSprints =
      await this.sprintsRepository.findByProject(projectId);
    const priorCompleted = completedSprints
      .filter(
        (s) => s.status === SprintStatus.COMPLETED && s._id.toString() !== id,
      )
      .slice(0, 10);

    const velocity: Array<{
      sprintId: string;
      name: string;
      completedAt?: Date;
      totalTasks: number;
      completedTasks: number;
      completionPercent: number;
    }> = [];
    for (const s of priorCompleted) {
      const sTasks = await this.sprintTasks(s._id.toString());
      const sTotal = sTasks.filter((t) => t.status !== ARCHIVED).length;
      const sDone = sTasks.filter((t) => t.status === DONE).length;
      velocity.push({
        sprintId: s._id.toString(),
        name: s.name,
        completedAt: s.completedAt,
        totalTasks: sTotal,
        completedTasks: sDone,
        completionPercent: sTotal > 0 ? Math.round((sDone / sTotal) * 100) : 0,
      });
    }

    return {
      sprintId: id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalTasks: total,
      completedTasks: done,
      completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
      overdueTasks: notArchived.filter(
        (t) => t.status !== DONE && t.dueDate < now,
      ).length,
      blockedTasks: notArchived.filter((t) => t.isBlocked).length,
      tasksByStatus,
      velocity,
    };
  }
}
