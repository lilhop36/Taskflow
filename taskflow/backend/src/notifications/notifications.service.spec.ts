import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: jest.Mocked<NotificationsRepository>;

  const mockNotifications = [
    { _id: 'n1', message: 'Task assigned', read: false },
    { _id: 'n2', message: 'Status changed', read: false },
  ] as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: {
            create: jest.fn(),
            findUnreadByUser: jest.fn(),
            findByUser: jest.fn(),
            markAsRead: jest.fn(),
            markAllAsRead: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repository = module.get(NotificationsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findUnreadByUser() — FR-008.4', () => {
    it('should return unread notifications for a user', async () => {
      repository.findUnreadByUser.mockResolvedValue(mockNotifications);
      const result = await service.findUnreadByUser('user-1');
      expect(result).toHaveLength(2);
      expect(repository.findUnreadByUser).toHaveBeenCalledWith('user-1');
    });

    it('should return empty array when no notifications exist', async () => {
      repository.findUnreadByUser.mockResolvedValue([]);
      const result = await service.findUnreadByUser('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('findByUser() — history view', () => {
    it('should return full history (read + unread) for a user', async () => {
      repository.findByUser.mockResolvedValue([
        { _id: 'n1', read: false },
        { _id: 'n2', read: true },
      ] as any);
      const result = await service.findByUser('user-1');
      expect(result).toHaveLength(2);
      expect(repository.findByUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('markAsRead() — FR-008.4', () => {
    it('should mark a single notification as read, scoped to the user', async () => {
      repository.markAsRead.mockResolvedValue({ _id: 'n1', read: true } as any);
      await service.markAsRead('n1', 'user-1');
      expect(repository.markAsRead).toHaveBeenCalledWith('n1', 'user-1');
    });

    it('should throw NotFoundException when the notification is not found or not owned', async () => {
      repository.markAsRead.mockResolvedValue(null);

      await expect(service.markAsRead('n1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead() — FR-008.4', () => {
    it('should mark all of a user notifications as read', async () => {
      repository.markAllAsRead.mockResolvedValue({ modifiedCount: 2 } as any);
      await service.markAllAsRead('user-1');
      expect(repository.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });
});
