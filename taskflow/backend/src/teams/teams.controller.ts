import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.teamsService.delete(id);
  }

  @Post(':id/members')
  @Roles(UserRole.ADMIN)
  addMembers(@Param('id') id: string, @Body('userIds') userIds: string[]) {
    return this.teamsService.addMembers(id, userIds);
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.ADMIN)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.teamsService.removeMember(id, userId);
  }
}
