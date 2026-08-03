import { Types } from 'mongoose';
import { ProjectsRepository } from './projects.repository';

/**
 * Unit Tests — ProjectsRepository.isUserMemberOfProject
 *
 * SRS: FR-007.2 — only users with access to the parent project may
 * comment/view comments. The project owner is always a member (BR-008)
 * even when not listed in the `members` array.
 */
describe('ProjectsRepository.isUserMemberOfProject — FR-007.2', () => {
  const ownerId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const outsiderId = new Types.ObjectId().toString();

  function makeRepo(project: { owner?: Types.ObjectId; members?: Types.ObjectId[] } | null) {
    const select = jest.fn().mockReturnThis();
    const exec = jest.fn().mockResolvedValue(project);
    const findById = jest.fn().mockReturnValue({ select, exec });

    const projectModel = { findById } as any;
    const taskModel = {} as any;
    const repo = new ProjectsRepository(projectModel, taskModel);
    return { repo, findById, select };
  }

  it('should return true for the project owner (BR-008)', async () => {
    const { repo } = makeRepo({
      owner: new Types.ObjectId(ownerId),
      members: [],
    });

    const result = await repo.isUserMemberOfProject(ownerId, 'project-1');
    expect(result).toBe(true);
  });

  it('should return true for a user listed in members', async () => {
    const { repo } = makeRepo({
      owner: new Types.ObjectId(ownerId),
      members: [new Types.ObjectId(memberId)],
    });

    const result = await repo.isUserMemberOfProject(memberId, 'project-1');
    expect(result).toBe(true);
  });

  it('should return false for a user who is neither owner nor member', async () => {
    const { repo } = makeRepo({
      owner: new Types.ObjectId(ownerId),
      members: [new Types.ObjectId(memberId)],
    });

    const result = await repo.isUserMemberOfProject(outsiderId, 'project-1');
    expect(result).toBe(false);
  });

  it('should return false when the project does not exist', async () => {
    const { repo } = makeRepo(null);

    const result = await repo.isUserMemberOfProject(ownerId, 'missing');
    expect(result).toBe(false);
  });

  it('should select owner and members fields for the lookup', async () => {
    const { repo, findById, select } = makeRepo({
      owner: new Types.ObjectId(ownerId),
      members: [],
    });

    await repo.isUserMemberOfProject(ownerId, 'project-1');
    expect(findById).toHaveBeenCalledWith('project-1');
    expect(select).toHaveBeenCalledWith('owner members');
  });
});
