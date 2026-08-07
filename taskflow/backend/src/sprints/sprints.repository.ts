import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sprint, SprintDocument, SprintStatus } from './schemas/sprint.schema';

export interface SprintWithStats extends Sprint {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  taskCount: number;
  completedCount: number;
}

@Injectable()
export class SprintsRepository {
  constructor(
    @InjectModel(Sprint.name)
    private readonly sprintModel: Model<SprintDocument>,
  ) {}

  create(data: Partial<Sprint>): Promise<SprintDocument> {
    const sprint = new this.sprintModel(data);
    return sprint.save();
  }

  async findById(id: string): Promise<SprintDocument | null> {
    return this.sprintModel.findById(id).populate('project', 'name').exec();
  }

  async findRawById(id: string): Promise<SprintDocument | null> {
    return this.sprintModel.findById(id).exec();
  }

  async findByProject(projectId: string): Promise<SprintWithStats[]> {
    const project = new Types.ObjectId(projectId);

    return this.sprintModel.aggregate<SprintWithStats>([
      { $match: { project } },
      {
        $lookup: {
          from: 'tasks',
          let: { sprintId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$sprintId', '$$sprintId'] } } },
            {
              $group: {
                _id: null,
                taskCount: { $sum: 1 },
                completedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] },
                },
              },
            },
          ],
          as: 'stats',
        },
      },
      {
        $addFields: {
          taskCount: {
            $ifNull: [{ $arrayElemAt: ['$stats.taskCount', 0] }, 0],
          },
          completedCount: {
            $ifNull: [{ $arrayElemAt: ['$stats.completedCount', 0] }, 0],
          },
        },
      },
      { $project: { stats: 0 } },
      { $sort: { createdAt: -1 } },
    ]);
  }

  async findActiveByProject(
    projectId: string,
    excludeId?: string,
  ): Promise<SprintDocument | null> {
    const filter: { [key: string]: unknown } = {
      project: new Types.ObjectId(projectId),
      status: SprintStatus.ACTIVE,
    };
    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }
    return this.sprintModel.findOne(filter).exec();
  }

  async update(
    id: string,
    data: Partial<Sprint>,
  ): Promise<SprintDocument | null> {
    return this.sprintModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('project', 'name')
      .exec();
  }

  async remove(id: string): Promise<SprintDocument | null> {
    return this.sprintModel.findByIdAndDelete(id).exec();
  }
}
