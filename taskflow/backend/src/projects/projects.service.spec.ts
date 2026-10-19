import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { VisibilityPolicyService } from './visibility-policy.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { ProjectStatus } from './schemas/project.schema';

/**
 * Unit Tests — ProjectsService
 *
 * SRS: FR-003 (Project Management), BR-003 (Archive with active tasks blocked)
 */
describe('ProjectsService', () => {
  let service: ProjectsService;
  let repository: jest.Mocked<ProjectsRepository>;
  let usersService: jest.Mocked<UsersService>;

  const mockProject = {
    _id: { toString: () => 'project-id-123' },
    name: 'TaskFlow MVP',
    description: 'Main project',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    status: ProjectStatus.ACTIVE,
    owner: { toString: () => 'owner-id' },
    members: [],
    toObject: () => ({
      _id: 'project-id-123',
      name: 'TaskFlow MVP',
      status: ProjectStatus.ACTIVE,
      // Included so update() can fall back to the untouched date bound.
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
    }),
  } as any;

  const mockProjectManager = {
    _id: { toString: () => 'owner-id' },
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    role: UserRole.PROJECT_MANAGER,
    status: 'Active',
  } as any;

  // Shared repository mock — the real VisibilityPolicyService is wired on
  // top of it so the BR-001 role logic is exercised, not mocked away.
  const repositoryMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByMember: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    countActiveTasks: jest.fn(),
    isUserMemberOfProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: ProjectsRepository,
          useValue: repositoryMock,
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: VisibilityPolicyService,
          useValue: new VisibilityPolicyService(
            repositoryMock as unknown as ProjectsRepository,
          ),
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    repository = module.get(ProjectsRepository);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findById() ───────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return project when found', async () => {
      repository.findById.mockResolvedValue(mockProject);

      const result = await service.findById('project-id-123');

      expect(result).toBeDefined();
      expect(repository.findById).toHaveBeenCalledWith('project-id-123');
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAllForUser() — membership scoping ────────────────────────────────

  describe('findAllForUser()', () => {
    const teamMember = {
      _id: { toString: () => 'member-id' },
      role: UserRole.TEAM_MEMBER,
    } as any;
    const pm = {
      _id: { toString: () => 'pm-id' },
      role: UserRole.PROJECT_MANAGER,
    } as any;
    const admin = {
      _id: { toString: () => 'admin-id' },
      role: UserRole.ADMIN,
    } as any;

    it('Team Member sees only projects they own or belong to', async () => {
      repository.findByMember.mockResolvedValue([mockProject]);

      const result = await service.findAllForUser(teamMember);

      expect(repository.findByMember).toHaveBeenCalledWith('member-id');
      expect(repository.findAll).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('PM/Admin sees all projects without scoping (BR-001)', async () => {
      repository.findAll.mockResolvedValue([mockProject]);

      const result = await service.findAllForUser(pm);

      expect(repository.findAll).toHaveBeenCalled();
      expect(repository.findByMember).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);

      repository.findAll.mockClear();
      await service.findAllForUser(admin);
      expect(repository.findAll).toHaveBeenCalled();
    });

    it('missing user fails closed', async () => {
      await expect(service.findAllForUser(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(repository.findAll).not.toHaveBeenCalled();
    });
  });

  // ─── archive() — BR-003 ───────────────────────────────────────────────────

  describe('archive()', () => {
    it('should archive a project with no active tasks (BR-003, FR-003.3)', async () => {
      repository.findById.mockResolvedValue(mockProject);
      repository.countActiveTasks.mockResolvedValue(0);
      repository.archive.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        toObject: () => ({ status: ProjectStatus.ARCHIVED }),
      });

      const result = await service.archive('project-id-123');

      expect(repository.archive).toHaveBeenCalledWith('project-id-123');
      expect(result.status).toBe(ProjectStatus.ARCHIVED);
    });

    it('should throw BadRequestException when project has active tasks (BR-003)', async () => {
      repository.findById.mockResolvedValue(mockProject);
      repository.countActiveTasks.mockResolvedValue(3); // 3 active tasks

      await expect(service.archive('project-id-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.archive).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when project is already archived', async () => {
      const archivedProject = {
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        toObject: () => ({ status: ProjectStatus.ARCHIVED }),
      };
      repository.findById.mockResolvedValue(archivedProject);

      await expect(service.archive('project-id-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.countActiveTasks).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.archive('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    // The DTO validates @IsMongoId, so fixtures use real ObjectId hex strings
    // (the service now hands owners/members to `new Types.ObjectId`).
    const OWNER_ID = '507f1f77bcf86cd799439011';
    const validDto = {
      name: 'TaskFlow MVP',
      description: 'Main project',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      owner: OWNER_ID,
      members: [],
    };

    it('should create project with coerced date strings (FR-003.1)', async () => {
      repository.create.mockResolvedValue(mockProject);
      usersService.findById.mockResolvedValue(mockProjectManager);

      const result = await service.create(validDto);

      expect(usersService.findById).toHaveBeenCalledWith(OWNER_ID);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Dates must be converted to Date objects, not left as strings
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when endDate is before startDate (BR-006)', async () => {
      await expect(
        service.create({
          ...validDto,
          startDate: '2024-12-31',
          endDate: '2024-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the owner does not exist (BR-008)', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the owner is not a Project Manager (BR-008)', async () => {
      usersService.findById.mockResolvedValue({
        ...mockProjectManager,
        role: UserRole.TEAM_MEMBER,
      });

      await expect(service.create(validDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should throw BadRequestException when the new dates invert the range (BR-006)', async () => {
      repository.findById.mockResolvedValue(mockProject);

      await expect(
        service.update('project-id-123', {
          startDate: '2024-06-01',
          endDate: '2024-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should allow updating only one bound while keeping the range valid', async () => {
      repository.findById.mockResolvedValue(mockProject);
      repository.update.mockResolvedValue(mockProject);

      // Existing range is 2024-01-01 → 2024-12-31; extending only the end is fine.
      await expect(
        service.update('project-id-123', { endDate: '2025-06-01' }),
      ).resolves.toBeDefined();
      expect(repository.update).toHaveBeenCalled();
    });

    it('should not accept a status field (archiving only via the archive endpoint)', async () => {
      repository.findById.mockResolvedValue(mockProject);
      repository.update.mockResolvedValue(mockProject);

      await service.update('project-id-123', {
        status: ProjectStatus.ARCHIVED,
      } as any);

      // The DTO has no status property, so the service must not persist it.
      expect(repository.update).toHaveBeenCalledWith(
        'project-id-123',
        expect.not.objectContaining({ status: ProjectStatus.ARCHIVED }),
      );
    });
  });
});
