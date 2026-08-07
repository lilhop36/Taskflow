import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Activity,
  ActivityDocument,
  ActivityType,
} from './schemas/activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name) private activityModel: Model<ActivityDocument>,
  ) {}

  async create(activityData: {
    type: ActivityType;
    actor: string;
    description: string;
    task?: string;
    project?: string;
    user?: string;
    comment?: string;
    sprint?: string;
    changes?: Array<{ field: string; oldValue: any; newValue: any }>;
    metadata?: Record<string, any>;
    isPublic?: boolean;
    mentionedUsers?: string[];
  }): Promise<Activity> {
    const activity = new this.activityModel(activityData);
    return activity.save();
  }

  async findByProject(
    projectId: string,
    limit: number = 50,
  ): Promise<Activity[]> {
    return this.activityModel
      .find({ project: projectId, isPublic: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email avatar')
      .populate('mentionedUsers', 'firstName lastName email avatar')
      .exec();
  }

  async findByTask(taskId: string, limit: number = 50): Promise<Activity[]> {
    return this.activityModel
      .find({ task: taskId, isPublic: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email avatar')
      .populate('mentionedUsers', 'firstName lastName email avatar')
      .exec();
  }

  async findByUser(userId: string, limit: number = 50): Promise<Activity[]> {
    return this.activityModel
      .find({ actor: userId, isPublic: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email avatar')
      .populate('task', 'title')
      .populate('project', 'name')
      .exec();
  }

  async findMentionsForUser(
    userId: string,
    limit: number = 20,
  ): Promise<Activity[]> {
    return this.activityModel
      .find({ mentionedUsers: userId, isPublic: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email avatar')
      .populate('task', 'title')
      .populate('project', 'name')
      .exec();
  }

  async findRecent(limit: number = 20): Promise<Activity[]> {
    return this.activityModel
      .find({ isPublic: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email avatar')
      .populate('task', 'title')
      .populate('project', 'name')
      .exec();
  }

  async deleteByTask(taskId: string): Promise<void> {
    await this.activityModel.deleteMany({ task: taskId }).exec();
  }

  async deleteByProject(projectId: string): Promise<void> {
    await this.activityModel.deleteMany({ project: projectId }).exec();
  }
}
