import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

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
  constructor(private readonly commentsService: CommentsService) {}

  /**
   * FR-007.2: Post a comment on a task.
   * Exposes POST /api/tasks/:taskId/comments
   *
   * authorId is resolved from the JWT token (Sprint 1 infrastructure).
   * Currently hardcoded to empty — when JwtAuthGuard is wired globally,
   * replace with @CurrentUser('_id') from the guard's req.user.
   * The service gracefully skips setting author when the value is empty.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('taskId') taskId: string,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentsService.create(createCommentDto, taskId, '');
  }

  /**
   * FR-007.1: View chronological comment thread for a task.
   * Exposes GET /api/tasks/:taskId/comments
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Param('taskId') taskId: string) {
    return this.commentsService.findByTask(taskId);
  }
}
