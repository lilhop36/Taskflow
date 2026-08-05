import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { refId } from '../common/ref-id';
import { ProjectsRepository } from './projects.repository';
import { UserRole } from '../users/schemas/user.schema';

/** Shape of request.user the policy needs for read decisions (BR-001). */
export interface VisibilityUser {
  _id: { toString(): string };
  role?: UserRole;
}

/** Minimal task shape the policy needs to derive the parent project. */
interface TaskProjectRef {
  project?: unknown;
}

/**
 * Single shared visibility policy — the one module that decides whether a
 * user may READ a project or task.
 *
 * The rule (BR-001 hierarchy + BR-003 membership) used to be re-derived in
 * five places — ProjectsService.findAllForUser, ProjectsService
 * .isUserMemberOfProject, TasksService.memberProjectIds/findByProject,
 * ReportsService.getDashboard, and both project guards — each with a
 * slightly different expression. This module is the single seam:
 *
 *   - Admins / Project Managers bypass membership entirely (BR-001).
 *   - Team Members may only read projects they own or are listed in (BR-003),
 *     delegated to ProjectsRepository.isUserMemberOfProject.
 *
 * `visibleProjectIds` / `visibleProjectIdNames` return `null` for full
 * visibility (Admins/PMs) so list queries are not needlessly scoped.
 */
@Injectable()
export class VisibilityPolicyService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  /** BR-001: Admins and Project Managers see every project/task. */
  isFullVisibility(role?: UserRole): boolean {
    return role === UserRole.ADMIN || role === UserRole.PROJECT_MANAGER;
  }

  /**
   * May this user read the project's content (tasks, comments, reports)?
   * Missing user fails closed (false).
   */
  async canReadProject(
    user: VisibilityUser | undefined,
    projectId: string,
  ): Promise<boolean> {
    if (!user) return false;
    if (this.isFullVisibility(user.role)) return true;
    return this.projectsRepository.isUserMemberOfProject(
      user._id.toString(),
      projectId,
    );
  }

  /**
   * May this user read the task? Delegates to the task's parent project,
   * resolved through the stable refId shape (raw ObjectId, string, or
   * populated document) — same seam Candidate 1 pinned at the repository
   * boundary, so a populated project doc's inspect-blob toString() can
   * never leak. A task with no project ref fails closed (false).
   */
  async canReadTask(
    user: VisibilityUser | undefined,
    task: TaskProjectRef,
  ): Promise<boolean> {
    const projectId = refId(task.project);
    if (!projectId) return false;
    return this.canReadProject(user, projectId);
  }

  /**
   * Project ids the user may read. `null` means full visibility (Admins/PMs);
   * otherwise the ids of projects the user owns or belongs to. Missing user
   * throws — list endpoints fail closed with 401.
   */
  async visibleProjectIds(
    user: VisibilityUser | undefined,
  ): Promise<Types.ObjectId[] | null> {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (this.isFullVisibility(user.role)) return null;
    return this.projectsRepository.findIdsForMember(user._id.toString());
  }

  /**
   * Lightweight id+name pairs the user may read (dashboard dropdown).
   * `null` means full visibility (Admins/PMs) — the caller then lists all
   * projects. Missing user throws — fail closed with 401.
   */
  async visibleProjectIdNames(
    user: VisibilityUser | undefined,
  ): Promise<{ _id: Types.ObjectId; name: string }[] | null> {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (this.isFullVisibility(user.role)) return null;
    return this.projectsRepository.findIdNameForMember(user._id.toString());
  }
}
