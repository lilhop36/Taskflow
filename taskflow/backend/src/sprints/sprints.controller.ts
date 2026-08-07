import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MongoIdValidationPipe } from '../common/pipes/mongo-id-validation.pipe';
import { UserRole } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { AddTasksDto } from './dto/add-tasks.dto';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { SprintsService } from './sprints.service';

@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get()
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN, UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('project') projectId?: string,
    @CurrentUser() user?: UserDocument,
  ) {
    return this.sprintsService.findAll(projectId || undefined, {
      id: user?._id.toString() ?? '',
      role: user?.role ?? UserRole.TEAM_MEMBER,
    });
  }

  @Post()
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createSprintDto: CreateSprintDto,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.sprintsService.create(createSprintDto, userId, userRole);
  }

  @Get(':id')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN, UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser() user?: UserDocument,
  ) {
    return this.sprintsService.findById(id, user?._id.toString(), user?.role);
  }

  @Patch(':id')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', MongoIdValidationPipe) id: string,
    @Body() updateSprintDto: UpdateSprintDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.sprintsService.update(id, updateSprintDto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', MongoIdValidationPipe) id: string) {
    return this.sprintsService.remove(id);
  }

  @Post(':id/start')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async start(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser('_id') userId: string,
  ) {
    return this.sprintsService.start(id, userId);
  }

  @Post(':id/complete')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser('_id') userId: string,
  ) {
    return this.sprintsService.complete(id, userId);
  }

  @Post(':id/tasks')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async addTasks(
    @Param('id', MongoIdValidationPipe) id: string,
    @Body() addTasksDto: AddTasksDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.sprintsService.addTasks(id, addTasksDto.taskIds, userId);
  }

  @Delete(':id/tasks/:taskId')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async removeTask(
    @Param('id', MongoIdValidationPipe) id: string,
    @Param('taskId', MongoIdValidationPipe) taskId: string,
    @CurrentUser('_id') userId: string,
  ) {
    return this.sprintsService.removeTask(id, taskId, userId);
  }

  @Get(':id/board')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN, UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async board(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser() user?: UserDocument,
  ) {
    return this.sprintsService.getBoard(
      id,
      user?._id.toString() ?? '',
      user?.role ?? UserRole.TEAM_MEMBER,
    );
  }

  @Get(':id/burndown')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN, UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async burndown(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser() user?: UserDocument,
  ) {
    return this.sprintsService.getBurndown(
      id,
      user?._id.toString() ?? '',
      user?.role ?? UserRole.TEAM_MEMBER,
    );
  }

  @Get(':id/report')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async report(
    @Param('id', MongoIdValidationPipe) id: string,
    @CurrentUser() user?: UserDocument,
  ) {
    return this.sprintsService.getReport(
      id,
      user?._id.toString() ?? '',
      user?.role ?? UserRole.ADMIN,
    );
  }
}
