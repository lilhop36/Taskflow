import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsRepository } from './teams.repository';

describe('TeamsService', () => {
  let service: TeamsService;
  let repository: jest.Mocked<TeamsRepository>;

  const mockTeam = {
    _id: { toString: () => 'team-id-123' },
    name: 'Engineering',
    description: 'Core engineering team',
    members: [],
    toObject: () => ({
      _id: 'team-id-123',
      name: 'Engineering',
      description: 'Core engineering team',
      members: [],
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: TeamsRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            addMembers: jest.fn(),
            removeMember: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    repository = module.get(TeamsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('should create a team with a unique name (FR-003.1)', async () => {
      repository.findAll.mockResolvedValue([]);
      repository.create.mockResolvedValue(mockTeam);

      const result = await service.create({
        name: 'Engineering',
        description: 'Core engineering team',
      });

      expect(repository.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ConflictException when team name already exists', async () => {
      repository.findAll.mockResolvedValue([mockTeam]);

      await expect(
        service.create({
          name: 'Engineering',
          description: 'Duplicate team',
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('should return all teams', async () => {
      repository.findAll.mockResolvedValue([mockTeam]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById()', () => {
    it('should return team when found', async () => {
      repository.findById.mockResolvedValue(mockTeam);
      const result = await service.findById('team-id-123');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when team does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should update an existing team (FR-003.1)', async () => {
      repository.findById.mockResolvedValue(mockTeam);
      repository.update.mockResolvedValue({ ...mockTeam, description: 'Updated' } as any);

      const result = await service.update('team-id-123', { description: 'Updated' });
      expect(repository.update).toHaveBeenCalledWith('team-id-123', { description: 'Updated' });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when team does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete()', () => {
    it('should delete an existing team', async () => {
      repository.findById.mockResolvedValue(mockTeam);
      repository.delete.mockResolvedValue(mockTeam);
      await service.delete('team-id-123');
      expect(repository.delete).toHaveBeenCalledWith('team-id-123');
    });

    it('should throw NotFoundException when team does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMembers() — FR-003.2', () => {
    it('should add members to a team', async () => {
      repository.findById.mockResolvedValue(mockTeam);
      repository.addMembers.mockResolvedValue({ ...mockTeam, members: ['user-1'] } as any);

      const result = await service.addMembers('team-id-123', ['user-1']);
      expect(repository.addMembers).toHaveBeenCalledWith('team-id-123', ['user-1']);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when team does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.addMembers('missing', ['user-1'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember() — FR-003.3', () => {
    it('should remove a member from a team', async () => {
      repository.findById.mockResolvedValue(mockTeam);
      repository.removeMember.mockResolvedValue(mockTeam);

      const result = await service.removeMember('team-id-123', 'user-1');
      expect(repository.removeMember).toHaveBeenCalledWith('team-id-123', 'user-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when team does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.removeMember('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
