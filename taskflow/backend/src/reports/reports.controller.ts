import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

/**
 * Controller for report endpoints.
 *
 * Routes:
 *   GET /api/reports/project/:projectId   — Project status report (FR-009.1)
 *   GET /api/reports/employee/:userId     — Employee perf report (FR-009.2)
 *
 * FR-009.3 (Project Manager restriction) will be enforced once
 * the global JwtAuthGuard + RolesGuard are wired in a future sprint.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * FR-009.1: Generate project status report.
   * Returns completion %, task distribution, overdue tasks, time progress.
   */
  @Get('project/:projectId')
  async getProjectReport(@Param('projectId') projectId: string) {
    return this.reportsService.getProjectReport(projectId);
  }

  /**
   * FR-009.2: Generate employee performance report.
   * Returns on-time completion rate, active workload, missed deadlines.
   */
  @Get('employee/:userId')
  async getEmployeeReport(@Param('userId') userId: string) {
    return this.reportsService.getEmployeeReport(userId);
  }
}
