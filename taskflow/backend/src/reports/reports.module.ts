import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Feature module for report generation.
 *
 * Imports TasksModule, ProjectsModule, and UsersModule so ReportsService
 * can inject their repositories/services for data aggregation.
 *
 * SRS: FR-009.1-3
 */
@Module({
  imports: [TasksModule, ProjectsModule, UsersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
