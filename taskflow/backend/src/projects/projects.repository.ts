import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { TaskStatus } from '../tasks/schemas/task.schema';

@Injectable()
export class ProjectsRepository {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async create(data: Partial<Project>): Promise<ProjectDocument> {
    const project = new this.projectModel(data);
    return project.save();
  }

  async findAll(): Promise<ProjectDocument[]> {
    return this.projectModel
      .find()
      .populate('owner', '-passwordHash')
      .populate('members', '-passwordHash')
      .populate('teams', 'name description')
      .exec();
  }

  async findById(id: string): Promise<ProjectDocument | null> {
    return this.projectModel
      .findById(id)
      .populate('owner', '-passwordHash')
      .populate('members', '-passwordHash')
      .populate('teams', 'name description')
      .exec();
  }

  async update(
    id: string,
    data: Partial<Project>,
  ): Promise<ProjectDocument | null> {
    return this.projectModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('owner', '-passwordHash')
      .populate('members', '-passwordHash')
      .populate('teams', 'name description')
      .exec();
  }

  async archive(id: string): Promise<ProjectDocument | null> {
    return this.projectModel
      .findByIdAndUpdate(
        id,
        { status: 'Archived' },
        { new: true },
      )
      .populate('owner', '-passwordHash')
      .exec();
  }

  async countActiveTasks(id: string): Promise<number> {
    return this.taskModel.countDocuments({
      project: new Types.ObjectId(id),
      status: { $ne: TaskStatus.DONE },
    }).exec();
  }

  async isUserMemberOfProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.projectModel
      .findById(projectId)
      .select('members')
      .exec();

    if (!project) {
      return false;
    }

    // Check if userId exists in the members array
    return project.members.some(memberId => memberId.equals(new Types.ObjectId(userId)));
  }
}
