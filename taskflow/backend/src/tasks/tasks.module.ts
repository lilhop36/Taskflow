import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { DeadlineUrgentCron } from './deadline-urgent.cron';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { Task, TaskSchema } from './schemas/task.schema';

@Module({
  imports: [
    // Registers the @nestjs/schedule scheduler; the DeadlineUrgentCron
    // provider below declares the hourly FR-008.3 scan.
    ScheduleModule.forRoot(),
    ProjectsModule,
    UsersModule,
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository, DeadlineUrgentCron],
  exports: [TasksService, TasksRepository],
})
export class TasksModule {}
