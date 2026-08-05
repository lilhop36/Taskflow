import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { VisibilityPolicyService } from '../projects/visibility-policy.service';
import { TaskStatus } from './schemas/task.schema';
import { UserRole } from '../users/schemas/user.schema';

/**
 * Unit Tests — TasksController actor forwarding
 *
 * Proves the authenticated user id (bound by @CurrentUser() from
 * request.user, which the global JwtAuthGuard populates via the JWT
 * strategy) reaches TasksService on every mutation route — so every
 * user-triggered task event carries a real sender in its notification.
 */
describe('TasksController', () => {
  let controller: TasksController;
  let createMock: jest.Mock;
  let updateMock: jest.Mock;
  let updateStatusMock: jest.Mock;

  // The shape @CurrentUser() binds: the full authenticated user document.
  const user = {
    _id: { toString: () => 'actor-1' },
    role: UserRole.PROJECT_MANAGER,
  };
  const createDto = { title: 'Build API' };
  const updateDto = { assignee: 'user-2' };
  const statusDto = { status: TaskStatus.IN_PROGRESS };

  beforeEach(async () => {
    createMock = jest.fn();
    updateMock = jest.fn();
    updateStatusMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            create: createMock,
            update: updateMock,
            updateStatus: updateStatusMock,
            findAll: jest.fn(),
            findByProject: jest.fn(),
            findByAssignee: jest.fn(),
            findById: jest.fn(),
          },
        },
        // ProjectMemberGuard (used on the findOne route) needs the shared
        // visibility policy to resolve — not exercised here.
        {
          provide: VisibilityPolicyService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get(TasksController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create() forwards the authenticated user id as the actor', async () => {
    await controller.create(createDto, user);

    expect(createMock).toHaveBeenCalledWith(createDto, 'actor-1');
  });

  it('update() forwards the authenticated user id as the actor', async () => {
    await controller.update('task-1', updateDto, user);

    expect(updateMock).toHaveBeenCalledWith('task-1', updateDto, 'actor-1');
  });

  it('updateStatus() forwards the authenticated user id as the actor', async () => {
    await controller.updateStatus('task-1', statusDto, user);

    expect(updateStatusMock).toHaveBeenCalledWith(
      'task-1',
      statusDto,
      'actor-1',
    );
  });
});
