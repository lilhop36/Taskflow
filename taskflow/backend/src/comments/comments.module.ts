import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

/**
 * Feature module for task-level comments.
 *
 * Imports TasksModule so CommentsService can inject TasksRepository
 * (to verify the task exists before adding a comment).
 * Imports ProjectsModule so CommentsController can inject ProjectsService
 * (to verify user is a member of the project before commenting).
 *
 * SRS: FR-007.1-3
 */
@Module({
  imports: [TasksModule, ProjectsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
