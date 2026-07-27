import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

/**
 * Feature module for task-level comments.
 *
 * Imports TasksModule so CommentsService can inject TasksRepository
 * (to verify the task exists before adding a comment).
 *
 * SRS: FR-007.1-3
 */
@Module({
  imports: [TasksModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
