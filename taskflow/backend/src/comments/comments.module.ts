import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';
import { Comment, CommentSchema } from './schemas/comment.schema';

/**
 * Feature module for task-level comments.
 *
 * Imports TasksModule so CommentsService can inject TasksRepository
 * (to verify the task exists before adding a comment).
 * Imports ProjectsModule so the ProjectMemberGuard can inject
 * TasksService and ProjectsService (project access check).
 *
 * SRS: FR-007.1-3
 */
@Module({
  imports: [
    TasksModule,
    ProjectsModule,
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
