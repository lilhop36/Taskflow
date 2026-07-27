import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';

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
      .find({ project: projectId as any })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async findByAssignee(userId: string): Promise<TaskDocument[]> {
    return this.taskModel
      .find({ assignee: userId as any })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async update(
    id: string,
    data: Partial<Task>,
  ): Promise<TaskDocument | null> {
    return this.taskModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('assignee', '-passwordHash')
      .populate('createdBy', '-passwordHash')
      .exec();
  }

  async findByProjectAndAssignee(
    projectId: string,
    userId: string,
  ): Promise<TaskDocument[]> {
    return this.taskModel
      .find({
        project: projectId as any,
        assignee: userId as any,
      })
      .populate('assignee', '-passwordHash')
      .exec();
  }
}
