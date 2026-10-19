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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Task } from '../common/decorators/task.decorator';
import { ProjectMemberGuard } from '../common/guards/project-member.guard';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TasksService } from './tasks.service';

/** Shape of request.user needed for read scoping (BR-001). */
type UserContext = { _id: { toString(): string }; role?: UserRole };

/** The task shape ProjectMemberGuard attaches to the request. */
type TaskView = Awaited<ReturnType<TasksService['findById']>>;

@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: UserContext,
  ) {
    // The authenticated user is the actor — the task.assigned event carries
    // them so the notification has a real sender.
    return this.tasksService.create(createTaskDto, user._id.toString());
  }

  /**
   * FR-004/FR-005 read visibility: Admins/PMs see everything; Team Members
   * see only tasks in projects they belong to (scoped in TasksService).
   */
  @Get()
  @Roles(UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('project', ParseMongoIdPipe) projectId?: string,
    @Query('assignee', ParseMongoIdPipe) assigneeId?: string,
    @CurrentUser() user?: UserContext,
  ) {
    if (projectId) {
      return this.tasksService.findByProject(projectId, user);
    }
    if (assigneeId) {
      return this.tasksService.findByAssignee(assigneeId, user);
    }
    return this.tasksService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.TEAM_MEMBER)
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.OK)
  findOne(@Task() task: TaskView) {
    // ProjectMemberGuard already loaded the task (plain object via the
    // service) and verified the caller may access its parent project.
    return task;
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: UserContext,
  ) {
    // The authenticated user is the actor — a reassignment emits
    // TaskAssignedEvent with assignedBy = actorId (real sender).
    return this.tasksService.update(id, updateTaskDto, user._id.toString());
  }

  @Patch(':id/status')
  @Roles(UserRole.TEAM_MEMBER)
  // T-1: status changes are task-scoped writes and must go through the same
  // project-membership check as findOne. Without it, a member of project A can
  // move any task in project B by id.
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateStatusDto: UpdateTaskStatusDto,
    @CurrentUser() user: UserContext,
  ) {
    // The authenticated user is the actor — the task.status-changed event
    // carries them so the notification has a real sender.
    return this.tasksService.updateStatus(
      id,
      updateStatusDto,
      user._id.toString(),
    );
  }
}
