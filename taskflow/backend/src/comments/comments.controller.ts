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
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TasksService } from '../tasks/tasks.service';
import { ProjectsService } from '../projects/projects.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Controller for task comment endpoints.
 *
 * Routes are nested under tasks: /api/tasks/:taskId/comments
 * This REST convention makes it clear that comments belong to a parent task.
 *
 * SRS: FR-007.1-3
 * UML: Sequence SD-006a (View Comments), SD-006b (Add Comment)
 */
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly tasksService: TasksService,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * FR-007.2: Post a comment on a task.
   * Only users with access to the parent project can comment.
   * Exposes POST /api/tasks/:taskId/comments
   *
   * authorId is resolved from the JWT token via @CurrentUser('_id').
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('taskId') taskId: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser('_id') userId: string,
  ) {
    // First, verify the task exists
    const task = await this.tasksService.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user is a member of the project
    const isMember = await this.projectsService.isUserMemberOfProject(
      userId,
      task.project.toString(),
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to comment on this task',
      );
    }

    return this.commentsService.create(createCommentDto, taskId, userId);
  }

  /**
   * FR-007.1: View chronological comment thread for a task.
   * Only users with access to the parent project can view comments.
   * Exposes GET /api/tasks/:taskId/comments
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Param('taskId') taskId: string,
    @CurrentUser('_id') userId: string,
  ) {
    // First, verify the task exists
    const task = await this.tasksService.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user is a member of the project
    const isMember = await this.projectsService.isUserMemberOfProject(
      userId,
      task.project.toString(),
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to view comments on this task',
      );
    }

    return this.commentsService.findByTask(taskId);
  }

  /**
   * FR-007.2 (extended): Update a comment on a task.
   * Only the author of the comment or a project member can update.
   * Exposes PATCH /api/tasks/:taskId/comments/:commentId
   */
  @Patch(':commentId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @CurrentUser('_id') userId: string,
  ) {
    // First, verify the task exists
    const task = await this.tasksService.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user is a member of the project
    const isMember = await this.projectsService.isUserMemberOfProject(
      userId,
      task.project.toString(),
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to update a comment on this task',
      );
    }

    // Verify the comment exists and belongs to the task
    const comment = await this.commentsService.findCommentById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.task.toString() !== task._id.toString()) {
      throw new ForbiddenException(
        'Comment does not belong to the specified task',
      );
    }

    // Optionally, we can check if the user is the author of the comment
    // For now, we allow any project member to update any comment (as per typical project management tools)
    // If we want to restrict to author only, we can uncomment the following:
    // if (comment.author?.toString() !== userId) {
    //   throw new ForbiddenException('You can only edit your own comments');
    // }

    return this.commentsService.updateComment(
      commentId,
      updateCommentDto.content,
      userId,
    );
  }

  /**
   * FR-007.2 (extended): Delete a comment on a task.
   * Only the author of the comment or a project member can delete.
   * Exposes DELETE /api/tasks/:taskId/comments/:commentId
   */
  @Delete(':commentId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('_id') userId: string,
  ) {
    // First, verify the task exists
    const task = await this.tasksService.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if user is a member of the project
    const isMember = await this.projectsService.isUserMemberOfProject(
      userId,
      task.project.toString(),
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to delete a comment on this task',
      );
    }

    // Verify the comment exists and belongs to the task
    const comment = await this.commentsService.findCommentById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.task.toString() !== task._id.toString()) {
      throw new ForbiddenException(
        'Comment does not belong to the specified task',
      );
    }

    // Optionally, we can check if the user is the author of the comment
    // For now, we allow any project member to delete any comment (as per typical project tools)
    // If we want to restrict to author only, we can uncomment the following:
    // if (comment.author?.toString() !== userId) {
    //   throw new ForbiddenException('You can only delete your own comments');
    // }

    return this.commentsService.deleteComment(commentId, userId);
  }
}
