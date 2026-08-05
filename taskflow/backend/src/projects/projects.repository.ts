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

  /**
   * Finds projects a user owns or is listed as a member of. Used to scope
   * the project list for Team Members — they must not see projects they
   * don't belong to.
   */
  async findByMember(userId: string): Promise<ProjectDocument[]> {
    return this.projectModel
      .find({ $or: [{ owner: userId }, { members: userId }] })
      .populate('owner', '-passwordHash')
      .populate('members', '-passwordHash')
      .populate('teams', 'name description')
      .exec();
  }

  /**
   * Returns only the _ids of projects a user owns or belongs to — the
   * minimal lookup TasksService uses to scope task queries for Team Members.
   */
  async findIdsForMember(userId: string): Promise<Types.ObjectId[]> {
    const projects = await this.projectModel
      .find({ $or: [{ owner: userId }, { members: userId }] })
      .select('_id')
      .exec();
    return projects.map((p) => p._id);
  }

  /**
   * Lightweight id + name lookup for the dashboard project dropdown.
   * With a userId it's scoped to projects the user owns/belongs to;
   * without one it returns every project (Admin/PM view). Lean docs,
   * no population — the Dashboard needs nothing else.
   */
  async findIdNameForMember(
    userId?: string,
  ): Promise<{ _id: Types.ObjectId; name: string }[]> {
    const filter = userId
      ? { $or: [{ owner: userId }, { members: userId }] }
      : {};
    return this.projectModel
      .find(filter)
      .select('_id name')
      .lean<{ _id: Types.ObjectId; name: string }[]>()
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
      .findByIdAndUpdate(id, { status: 'Archived' }, { new: true })
      .populate('owner', '-passwordHash')
      .exec();
  }

  async countActiveTasks(id: string): Promise<number> {
    return this.taskModel
      .countDocuments({
        project: new Types.ObjectId(id),
        status: { $ne: TaskStatus.DONE },
      })
      .exec();
  }

  async isUserMemberOfProject(
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    const project = await this.projectModel
      .findById(projectId)
      .select('owner members')
      .exec();

    if (!project) {
      return false;
    }

    const userObjectId = new Types.ObjectId(userId);

    // BR-008: the project owner is always a member — they must be able
    // to comment on tasks even if they are not listed in `members`.
    if (project.owner && project.owner.equals(userObjectId)) {
      return true;
    }

    // Check if userId exists in the members array
    return project.members.some((memberId) => memberId.equals(userObjectId));
  }
}
