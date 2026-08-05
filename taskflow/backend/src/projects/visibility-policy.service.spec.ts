import { UnauthorizedException } from '@nestjs/common';
import { VisibilityPolicyService } from './visibility-policy.service';
import { ProjectsRepository } from './projects.repository';
import { UserRole } from '../users/schemas/user.schema';

/**
 * Unit Tests — VisibilityPolicyService
 *
 * The single shared read-access policy (BR-001 hierarchy + BR-003
 * membership). Every read endpoint — projects list/detail, tasks list /
 * by-project / by-assignee, comments (via ProjectMemberGuard), project
 * detail (via ProjectAccessGuard), and the reports dashboard — must
 * produce identical decisions through this module, so a user sees the
 * same projects/tasks everywhere.
 */
describe('VisibilityPolicyService', () => {
  let policy: VisibilityPolicyService;
  let isUserMemberOfProject: jest.Mock;
  let findIdsForMember: jest.Mock;
  let findIdNameForMember: jest.Mock;

  const admin = { _id: { toString: () => 'admin-1' }, role: UserRole.ADMIN };
  const pm = {
    _id: { toString: () => 'pm-1' },
    role: UserRole.PROJECT_MANAGER,
  };
  const member = {
    _id: { toString: () => 'member-1' },
    role: UserRole.TEAM_MEMBER,
  };

  beforeEach(() => {
    isUserMemberOfProject = jest.fn();
    findIdsForMember = jest.fn();
    findIdNameForMember = jest.fn();
    policy = new VisibilityPolicyService({
      isUserMemberOfProject,
      findIdsForMember,
      findIdNameForMember,
    } as unknown as ProjectsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isFullVisibility() — BR-001 hierarchy ────────────────────────────────

  describe('isFullVisibility()', () => {
    it('Administrators and Project Managers have full visibility (BR-001)', () => {
      expect(policy.isFullVisibility(UserRole.ADMIN)).toBe(true);
      expect(policy.isFullVisibility(UserRole.PROJECT_MANAGER)).toBe(true);
    });

    it('Team Members and missing roles do not', () => {
      expect(policy.isFullVisibility(UserRole.TEAM_MEMBER)).toBe(false);
      expect(policy.isFullVisibility(undefined)).toBe(false);
    });
  });

  // ─── canReadProject() ─────────────────────────────────────────────────────

  describe('canReadProject()', () => {
    it('Admins/PMs read any project without a membership query', async () => {
      await expect(policy.canReadProject(admin, 'p1')).resolves.toBe(true);
      await expect(policy.canReadProject(pm, 'p1')).resolves.toBe(true);
      expect(isUserMemberOfProject).not.toHaveBeenCalled();
    });

    it('Team Member reads a project they own or belong to (BR-003)', async () => {
      isUserMemberOfProject.mockResolvedValue(true);
      await expect(policy.canReadProject(member, 'p1')).resolves.toBe(true);
      expect(isUserMemberOfProject).toHaveBeenCalledWith('member-1', 'p1');
    });

    it('Team Member cannot read a project they are not in', async () => {
      isUserMemberOfProject.mockResolvedValue(false);
      await expect(policy.canReadProject(member, 'p2')).resolves.toBe(false);
    });

    it('missing user fails closed (false)', async () => {
      await expect(policy.canReadProject(undefined, 'p1')).resolves.toBe(false);
      expect(isUserMemberOfProject).not.toHaveBeenCalled();
    });
  });

  // ─── canReadTask() — delegates to the parent project ──────────────────────

  describe('canReadTask()', () => {
    it('derives the project id from a raw ObjectId-like task ref', async () => {
      isUserMemberOfProject.mockResolvedValue(true);
      await expect(
        policy.canReadTask(member, { project: { toString: () => 'p1' } }),
      ).resolves.toBe(true);
      expect(isUserMemberOfProject).toHaveBeenCalledWith('member-1', 'p1');
    });

    it('derives the project id from a string task ref', async () => {
      isUserMemberOfProject.mockResolvedValue(true);
      await expect(policy.canReadTask(member, { project: 'p1' })).resolves.toBe(
        true,
      );
    });

    it('resolves a populated project doc via its _id, not its inspect-blob toString()', async () => {
      // A populated Mongoose project doc: .toString() is inspect garbage,
      // but ._id holds the real id — refId must prefer _id (same fix as
      // the repository-seam work).
      const populatedProject = {
        _id: { toString: () => 'p1' },
        toString: () => 'util.inspect garbage',
      };
      isUserMemberOfProject.mockResolvedValue(true);
      await expect(
        policy.canReadTask(member, { project: populatedProject }),
      ).resolves.toBe(true);
      expect(isUserMemberOfProject).toHaveBeenCalledWith('member-1', 'p1');
    });

    it('a task without a project ref fails closed (false)', async () => {
      await expect(policy.canReadTask(member, {})).resolves.toBe(false);
      expect(isUserMemberOfProject).not.toHaveBeenCalled();
    });
  });

  // ─── visibleProjectIds() ──────────────────────────────────────────────────

  describe('visibleProjectIds()', () => {
    it('Admins/PMs get null (full visibility — no scoping needed)', async () => {
      await expect(policy.visibleProjectIds(admin)).resolves.toBeNull();
      await expect(policy.visibleProjectIds(pm)).resolves.toBeNull();
      expect(findIdsForMember).not.toHaveBeenCalled();
    });

    it('Team Members get their membership-scoped ids', async () => {
      findIdsForMember.mockResolvedValue(['p1']);
      await expect(policy.visibleProjectIds(member)).resolves.toEqual(['p1']);
      expect(findIdsForMember).toHaveBeenCalledWith('member-1');
    });

    it('missing user throws (list endpoints fail closed with 401)', async () => {
      await expect(policy.visibleProjectIds(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── visibleProjectIdNames() ──────────────────────────────────────────────

  describe('visibleProjectIdNames()', () => {
    it('Admins/PMs get null (dashboard then lists all projects)', async () => {
      await expect(policy.visibleProjectIdNames(pm)).resolves.toBeNull();
      expect(findIdNameForMember).not.toHaveBeenCalled();
    });

    it('Team Members get their membership-scoped id+name pairs', async () => {
      findIdNameForMember.mockResolvedValue([{ _id: 'p1', name: 'Alpha' }]);
      await expect(policy.visibleProjectIdNames(member)).resolves.toEqual([
        { _id: 'p1', name: 'Alpha' },
      ]);
      expect(findIdNameForMember).toHaveBeenCalledWith('member-1');
    });

    it('missing user throws (dashboard fails closed with 401)', async () => {
      await expect(policy.visibleProjectIdNames(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── Cross-endpoint consistency ───────────────────────────────────────────

  describe('cross-endpoint consistency (same user, same projects everywhere)', () => {
    it('Team Member sees the same scoped set on every read surface', async () => {
      findIdsForMember.mockResolvedValue([
        { toString: () => 'p1' },
        { toString: () => 'p2' },
      ]);
      isUserMemberOfProject.mockImplementation(
        (_userId: string, projectId: string) =>
          Promise.resolve(projectId === 'p1' || projectId === 'p2'),
      );
      findIdNameForMember.mockResolvedValue([
        { _id: 'p1', name: 'Alpha' },
        { _id: 'p2', name: 'Beta' },
      ]);

      // Tasks list scoping and projects list scoping share one membership query
      const ids = await policy.visibleProjectIds(member);
      expect(ids?.map(String).sort()).toEqual(['p1', 'p2']);

      // Dashboard scoping uses the same membership source
      const idNames = await policy.visibleProjectIdNames(member);
      expect(idNames?.map((p) => String(p._id)).sort()).toEqual(['p1', 'p2']);

      // Detail/guard checks agree with the list scoping — p1 and p2 are
      // readable, p3 is not
      await expect(policy.canReadProject(member, 'p1')).resolves.toBe(true);
      await expect(policy.canReadProject(member, 'p2')).resolves.toBe(true);
      await expect(policy.canReadProject(member, 'p3')).resolves.toBe(false);
    });

    it('Admin/PM sees everything on every read surface', async () => {
      const adminIds = await policy.visibleProjectIds(admin);
      const adminNames = await policy.visibleProjectIdNames(admin);
      expect(adminIds).toBeNull();
      expect(adminNames).toBeNull();
      await expect(policy.canReadProject(admin, 'any-project')).resolves.toBe(
        true,
      );
      // No membership queries were ever issued
      expect(findIdsForMember).not.toHaveBeenCalled();
      expect(findIdNameForMember).not.toHaveBeenCalled();
      expect(isUserMemberOfProject).not.toHaveBeenCalled();
    });
  });
});
