import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Team } from './schemas/team.schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsRepository } from './teams.repository';

@Injectable()
export class TeamsService {
  constructor(private readonly teamsRepository: TeamsRepository) {}

  async create(dto: CreateTeamDto) {
    const existing = await this.teamsRepository.findAll();
    if (existing.some((t) => t.name === dto.name)) {
      throw new ConflictException('A team with this name already exists');
    }
    return this.teamsRepository.create({
      name: dto.name,
      description: dto.description,
      members: (dto.members ?? []).map((id) => new Types.ObjectId(id)),
    });
  }

  async findAll() {
    return this.teamsRepository.findAll();
  }

  async findById(id: string) {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  async update(id: string, dto: UpdateTeamDto) {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    const updateData: Partial<Team> = {
      name: dto.name,
      description: dto.description,
    };
    if (dto.members) {
      updateData.members = dto.members.map((id) => new Types.ObjectId(id));
    }
    return this.teamsRepository.update(id, updateData);
  }

  async delete(id: string) {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.teamsRepository.delete(id);
  }

  async addMembers(id: string, userIds: string[]) {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.teamsRepository.addMembers(id, userIds);
  }

  async removeMember(id: string, userId: string) {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.teamsRepository.removeMember(id, userId);
  }
}
