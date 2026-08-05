import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { ReportsService } from './reports.service';

/** Shape of request.user needed for dashboard read scoping (BR-001). */
type UserContext = { _id: { toString(): string }; role?: UserRole };

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
   * FR-006: Dashboard aggregate — completion %, status distribution, overdue
   * tasks, and the project dropdown, in one call.
   *
   * Unlike the FR-009 reports (PM/Admin only), the dashboard is visible to
   * every authenticated role, so the handler overrides the class-level role
   * restriction with @Roles(TEAM_MEMBER). Scoping is applied inside
   * ReportsService: Team Members only see their own projects.
   */
  @Get('dashboard')
  @Roles(UserRole.TEAM_MEMBER)
  async getDashboard(
    @Query('project', ParseMongoIdPipe) projectId?: string,
    @CurrentUser() user?: UserContext,
  ) {
    return this.reportsService.getDashboard(user, projectId);
  }

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
