import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  // UsersModule so ProjectsService can verify the owner exists and has the
  // Project Manager role (BR-008) on creation.
  // Project + Task models: ProjectsRepository counts a project's active
  // tasks (BR-003 archive guard) via the Task model.
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsRepository],
  exports: [ProjectsService, ProjectsRepository],
})
export class ProjectsModule {}
