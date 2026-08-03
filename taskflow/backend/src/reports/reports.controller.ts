import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { ReportsService } from './reports.service';

/**
 * Controller for report endpoints.
 *
 * Routes:
 *   GET /api/reports/project/:projectId   — Project status report (FR-009.1)
 *   GET /api/reports/employee/:userId     — Employee perf report (FR-009.2)
 *
 * FR-009.3: Report generation restricted to Project Managers and Administrators.
 */
@Controller('reports')
@Roles(UserRole.PROJECT_MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * FR-009.1: Generate project status report.
   * Returns completion %, task distribution, overdue tasks, time progress.
   */
  @Get('project/:projectId')
  async getProjectReport(
    @Param('projectId', ParseMongoIdPipe) projectId: string,
  ) {
    return this.reportsService.getProjectReport(projectId);
  }

  /**
   * FR-009.2: Generate employee performance report.
   * Returns on-time completion rate, active workload, missed deadlines.
   */
  @Get('employee/:userId')
  async getEmployeeReport(@Param('userId', ParseMongoIdPipe) userId: string) {
    return this.reportsService.getEmployeeReport(userId);
  }
}
