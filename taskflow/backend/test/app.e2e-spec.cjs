const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { APP_GUARD } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { EventEmitterModule } = require('@nestjs/event-emitter');
const { MongooseModule } = require('@nestjs/mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

// DatabaseModelsModule was refactored into per-feature forFeature modules
// (UsersModule, ProjectsModule, ... register their own schemas), so the e2e
// app only needs MongooseModule.forRoot + the feature modules below.
const jwtConfig = require('../dist/config/jwt.config').default;
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { UsersModule } = require('../dist/users/users.module');
const { UsersService } = require('../dist/users/users.service');
const { ProjectsService } = require('../dist/projects/projects.service');
const { TasksService } = require('../dist/tasks/tasks.service');
const { AuthModule } = require('../dist/auth/auth.module');
const { ProjectsModule } = require('../dist/projects/projects.module');
const { TasksModule } = require('../dist/tasks/tasks.module');
const { CommentsModule } = require('../dist/comments/comments.module');
const { NotificationsModule } = require('../dist/notifications/notifications.module');
const { ReportsModule } = require('../dist/reports/reports.module');
// Registers the Team model; Project documents populate `teams`.
const { TeamsModule } = require('../dist/teams/teams.module');

describe('TaskFlow API (e2e)', () => {
  let app;
  let mongoServer;
  let adminToken;
  // Fixtures for the cross-project authorization regression (T-1).
  let memberToken;
  let projectBId;
  let taskBId;
  let projectATaskId;
  let pmBToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [jwtConfig] }),
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(uri),
        UsersModule,
        AuthModule,
        ProjectsModule,
        TasksModule,
        CommentsModule,
        NotificationsModule,
        ReportsModule,
        TeamsModule,
      ],
      providers: [
        // Mirror production AppModule: secure-by-default global guards, so
        // every non-@Public() route requires a real JWT.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Seed an admin through the real service, then log in over HTTP — the
    // token below authenticates every subsequent request.
    const usersService = moduleFixture.get(UsersService);
    await usersService.create({
      firstName: 'E2E',
      lastName: 'Admin',
      email: 'e2e.admin@taskflow.dev',
      password: 'DemoPass123!', // satisfies NFR-006 strength rules
      role: 'Administrator',
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e.admin@taskflow.dev', password: 'DemoPass123!' })
      .expect(200);
    adminToken = login.body.accessToken;
    expect(adminToken).toBeDefined();

    // ---- T-1 fixtures -------------------------------------------------
    // Two unrelated projects. `member` belongs to project A only; project B
    // has its own PM and a task that member must never be able to touch.
    const projectsService = moduleFixture.get(ProjectsService);
    const tasksService = moduleFixture.get(TasksService);
    const password = 'DemoPass123!';

    const pmA = await usersService.create({
      firstName: 'PM',
      lastName: 'Alpha',
      email: 'e2e.pm.a@taskflow.dev',
      password,
      role: 'ProjectManager',
    });
    const pmB = await usersService.create({
      firstName: 'PM',
      lastName: 'Beta',
      email: 'e2e.pm.b@taskflow.dev',
      password,
      role: 'ProjectManager',
    });
    const member = await usersService.create({
      firstName: 'Team',
      lastName: 'Member',
      email: 'e2e.member@taskflow.dev',
      password,
      role: 'TeamMember',
    });

    const projectA = await projectsService.create({
      name: 'Project Alpha',
      description: 'Cross-project regression fixture (member\'s project)',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      owner: pmA._id.toString(),
      members: [member._id.toString()],
    });
    const projectB = await projectsService.create({
      name: 'Project Beta',
      description: 'Cross-project regression fixture (foreign project)',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      owner: pmB._id.toString(),
    });
    projectBId = projectB._id.toString();

    const taskB = await tasksService.create(
      {
        title: 'Secret Beta task',
        description: 'Belongs to project B only',
        priority: 'High',
        dueDate: '2026-06-01',
        project: projectBId,
        assignee: pmB._id.toString(),
      },
      pmB._id.toString(),
    );
    taskBId = taskB._id.toString();

    const taskA = await tasksService.create(
      {
        title: 'Member task',
        description: 'Belongs to project A',
        priority: 'Medium',
        dueDate: '2026-06-01',
        project: projectA._id.toString(),
        assignee: member._id.toString(),
      },
      pmA._id.toString(),
    );
    projectATaskId = taskA._id.toString();

    const memberLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e.member@taskflow.dev', password })
      .expect(200);
    memberToken = memberLogin.body.accessToken;

    const pmBLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e.pm.b@taskflow.dev', password })
      .expect(200);
    pmBToken = pmBLogin.body.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (mongoServer) await mongoServer.stop();
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  describe('Auth (FR-001)', () => {
    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' })
        .expect(401);
    });

    it('should reject a short password without issuing a session (401)', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e.admin@taskflow.dev', password: 'Ab1!' })
        .expect(401);
    });
  });

  describe('Users (FR-002)', () => {
    it('GET /api/users with a session should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set(auth())
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Projects (FR-004)', () => {
    it('GET /api/projects with a session should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set(auth())
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/projects without a session should be rejected', () => {
      return request(app.getHttpServer()).get('/api/projects').expect(401);
    });
  });

  describe('Tasks (FR-005)', () => {
    it('GET /api/tasks with a session should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .set(auth())
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // T-1: PATCH /tasks/:id/status used to skip ProjectMemberGuard, so a member
  // of one project could change any task in any other project by id.
  describe('Cross-project authorization (T-1)', () => {
    const memberAuth = () => ({ Authorization: `Bearer ${memberToken}` });

    it('rejects a member editing a task in a project they do not belong to', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskBId}/status`)
        .set(memberAuth())
        .send({ status: 'In Progress' })
        .expect(403);
    });

    it('leaves the foreign task unchanged after the rejected write', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskBId}`)
        .set({ Authorization: `Bearer ${pmBToken}` })
        .expect(200);
      expect(res.body.status).toBe('To Do');
    });

    it('rejects reading a task in a foreign project', async () => {
      await request(app.getHttpServer())
        .get(`/api/tasks/${taskBId}`)
        .set(memberAuth())
        .expect(403);
    });

    it('still allows a member to change the status of a task in their own project', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${projectATaskId}/status`)
        .set(memberAuth())
        .send({ status: 'In Progress' })
        .expect(200);
      expect(res.body.status).toBe('In Progress');
    });

    it('allows the owning PM to change the status of their own task', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${taskBId}/status`)
        .set({ Authorization: `Bearer ${pmBToken}` })
        .send({ status: 'In Progress' })
        .expect(200);
      expect(res.body.status).toBe('In Progress');
    });
  });

  describe('Comments (FR-007)', () => {
    it('GET /api/tasks/:id/comments should 404 for an unknown task (ProjectMemberGuard)', async () => {
      await request(app.getHttpServer())
        .get('/api/tasks/000000000000000000000000/comments')
        .set(auth())
        .expect(404);
    });
  });

  describe('Reports (FR-009)', () => {
    it('GET /api/reports/project/:id should 404', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/project/000000000000000000000000')
        .set(auth())
        .expect(404);
    });

    it('GET /api/reports/employee/:id should 404', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/employee/000000000000000000000000')
        .set(auth())
        .expect(404);
    });
  });
});
