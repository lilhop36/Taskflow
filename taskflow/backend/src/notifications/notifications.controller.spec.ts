import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Unit tests — NotificationsController.unreadCount
 *
 * GET /api/notifications/unread-count — the sidebar badge endpoint.
 * Proves the authenticated user id is forwarded to the service and the
 * response is the `{ count }` envelope the badge reads. Ownership scoping
 * itself lives in the repository query (proven in the repository spec).
 */
describe('NotificationsController', () => {
  let controller: NotificationsController;
  let countMock: jest.Mock;

  beforeEach(async () => {
    countMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            findUnreadByUser: jest.fn(),
            findByUser: jest.fn(),
            countUnreadByUser: countMock,
            markAsRead: jest.fn(),
            markAllAsRead: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('unreadCount() — GET /notifications/unread-count', () => {
    it('returns { count } from the service for the authenticated user', async () => {
      countMock.mockResolvedValue(4);

      const result = await controller.unreadCount('user-1');

      expect(countMock).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ count: 4 });
    });
  });
});
