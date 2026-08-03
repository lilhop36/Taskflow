import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Task } from '../common/decorators/task.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { ProjectMemberGuard } from '../common/guards/project-member.guard';

/**
 * Controller for task comment endpoints.
 *
 * Routes are nested under tasks: /api/tasks/:taskId/comments
 * This REST convention makes it clear that comments belong to a parent task.
 *
 * Project access (FR-007.2) is enforced once by ProjectMemberGuard at the
 * class level: it loads the task (404 if missing) and verifies the caller
 * is a member of the parent project (Admins/PMs bypass via BR-001).
 *
 * SRS: FR-007.1-3
 * UML: Sequence SD-006a (View Comments), SD-006b (Add Comment)
 */
@Controller('tasks/:taskId/comments')
@UseGuards(ProjectMemberGuard)
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
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
    @Param('taskId', ParseMongoIdPipe) taskId: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.commentsService.create(createCommentDto, taskId, userId);
  }

  /**
   * FR-007.1: View chronological comment thread for a task.
   * Only users with access to the parent project can view comments.
   * Exposes GET /api/tasks/:taskId/comments
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Param('taskId', ParseMongoIdPipe) taskId: string) {
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
    @Param('taskId', ParseMongoIdPipe) taskId: string,
    @Param('commentId', ParseMongoIdPipe) commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Task() task: any,
    @CurrentUser('_id') userId: string,
  ) {
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
    @Param('taskId', ParseMongoIdPipe) taskId: string,
    @Param('commentId', ParseMongoIdPipe) commentId: string,
    @Task() task: any,
    @CurrentUser('_id') userId: string,
  ) {
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

    return this.commentsService.deleteComment(commentId, userId);
  }
}
