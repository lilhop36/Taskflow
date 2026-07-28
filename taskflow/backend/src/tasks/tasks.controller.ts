import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TasksService } from './tasks.service';

@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto, undefined);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('project') projectId?: string,
    @Query('assignee') assigneeId?: string,
  ) {
    if (projectId) {
      return this.tasksService.findByProject(projectId);
    }
    if (assigneeId) {
      return this.tasksService.findByAssignee(assigneeId);
    }
    return this.tasksService.findAll();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(id, updateStatusDto);
  }
}
