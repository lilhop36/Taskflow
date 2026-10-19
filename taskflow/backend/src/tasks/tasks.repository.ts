import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async create(data: Partial<Task>): Promise<TaskDocument> {
    const task = new this.taskModel(data);
    return task.save();
  }

  async findAll(): Promise<TaskDocument[]> {
    return this.taskModel
      .find()
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async findById(id: string): Promise<TaskDocument | null> {
    return this.taskModel
      .findById(id)
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async findByProject(projectId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ project: new Types.ObjectId(projectId) })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  /**
   * Finds tasks belonging to any of the given projects. Used to scope the
   * task list for Team Members to the projects they belong to.
   */
  async findByProjectIds(
    projectIds: Types.ObjectId[],
  ): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ project: { $in: projectIds } })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async findByAssignee(userId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ assignee: new Types.ObjectId(userId) })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  /**
   * Finds tasks assigned to a user, restricted to a set of projects. Used
   * to scope ?assignee= queries for Team Members so they can't enumerate
   * tasks in projects they don't belong to.
   */
  async findByAssigneeInProjects(
    userId: string,
    projectIds: Types.ObjectId[],
  ): Promise<TaskDocument[]> {
    return this.taskModel
      .find({
        assignee: new Types.ObjectId(userId),
        project: { $in: projectIds },
      })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async update(id: string, data: Partial<Task>): Promise<TaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  /**
   * Lean task projection for the dashboard aggregate: only the fields the
   * Dashboard renders (status distribution, completion, overdue list). No
   * population — keeps the endpoint cheap even at the SRS's 10K-task scale.
   */
  async findForDashboard(projectIds: Types.ObjectId[]): Promise<
    {
      _id: Types.ObjectId;
      title: string;
      status: TaskStatus;
      dueDate: Date;
      project: Types.ObjectId;
    }[]
  > {
    return this.taskModel
      .find({ project: { $in: projectIds } })
      .select('title status dueDate project')
      .lean<
        {
          _id: Types.ObjectId;
          title: string;
          status: TaskStatus;
          dueDate: Date;
          project: Types.ObjectId;
        }[]
      >()
      .exec();
  }

  /**
   * Finds incomplete tasks whose due date falls within [from, to] and that
   * have not yet received a deadline-urgent alert. Used by DeadlineUrgentCron
   * (FR-008.3) — the deadlineUrgentNotifiedAt flag dedups so each deadline
   * triggers exactly one notification.
   */
  async findDueWithin(from: Date, to: Date): Promise<TaskDocument[]> {
    return this.taskModel
      .find({
        status: { $ne: TaskStatus.DONE },
        dueDate: { $gte: from, $lte: to },
        deadlineUrgentNotifiedAt: null,
      })
      .populate('assignee', '-passwordHash')
      .exec();
  }

  /**
   * Records that a deadline-urgent alert has been sent for the task so the
   * cron and create/update emit paths don't notify the assignee repeatedly.
   */
  async markDeadlineUrgentNotified(id: string): Promise<TaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(
        id,
        { deadlineUrgentNotifiedAt: new Date() },
        { new: true, runValidators: true },
      )
      .exec();
  }
}
