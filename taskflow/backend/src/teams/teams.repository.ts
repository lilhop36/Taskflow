import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';

@Injectable()
export class TeamsRepository {
  constructor(
    @InjectModel(Team.name)
    private readonly teamModel: Model<TeamDocument>,
  ) {}

  async create(data: Partial<Team>): Promise<TeamDocument> {
    const team = new this.teamModel(data);
    return team.save();
  }

  async findAll(): Promise<TeamDocument[]> {
    return this.teamModel.find().populate('members', '-passwordHash').exec();
  }

  async findById(id: string): Promise<TeamDocument | null> {
    return this.teamModel
      .findById(id)
      .populate('members', '-passwordHash')
      .exec();
  }

  async update(
    id: string,
    data: Partial<Team>,
  ): Promise<TeamDocument | null> {
    return this.teamModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('members', '-passwordHash')
      .exec();
  }

  async delete(id: string): Promise<TeamDocument | null> {
    return this.teamModel.findByIdAndDelete(id).exec();
  }

  async addMembers(
    id: string,
    userIds: string[],
  ): Promise<TeamDocument | null> {
    return this.teamModel
      .findByIdAndUpdate(
        id,
        { $addToSet: { members: { $each: userIds } } },
        { new: true },
      )
      .populate('members', '-passwordHash')
      .exec();
  }

  async removeMember(
    id: string,
    userId: string,
  ): Promise<TeamDocument | null> {
    return this.teamModel
      .findByIdAndUpdate(
        id,
        { $pull: { members: userId } },
        { new: true },
      )
      .populate('members', '-passwordHash')
      .exec();
  }
}
