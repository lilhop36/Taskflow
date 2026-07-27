import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { ProjectStatus } from './schemas/project.schema';

/**
 * Unit Tests — ProjectsService
 *
 * SRS: FR-003 (Project Management), BR-003 (Archive with active tasks blocked)
 */
describe('ProjectsService', () => {
  let service: ProjectsService;
  let repository: jest.Mocked<ProjectsRepository>;

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
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: ProjectsRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            archive: jest.fn(),
            countActiveTasks: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    repository = module.get(ProjectsRepository);
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

  // ─── archive() — BR-003 ───────────────────────────────────────────────────

  describe('archive()', () => {
    it('should archive a project with no active tasks (BR-003, FR-003.3)', async () => {
      repository.findById.mockResolvedValue(mockProject);
      repository.countActiveTasks.mockResolvedValue(0);
      repository.archive.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        toObject: () => ({ status: ProjectStatus.ARCHIVED }),
      } as any);

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
    it('should create project with coerced date strings (FR-003.1)', async () => {
      repository.create.mockResolvedValue(mockProject);

      const dto = {
        name: 'TaskFlow MVP',
        description: 'Main project',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        owner: 'owner-id',
        members: [],
      };

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Dates must be converted to Date objects, not left as strings
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });
  });
});
