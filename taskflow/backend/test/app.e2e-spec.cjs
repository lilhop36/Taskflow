const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { EventEmitterModule } = require('@nestjs/event-emitter');
const { MongooseModule } = require('@nestjs/mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const { DatabaseModelsModule } = require('../dist/database/models/database-models.module');
const jwtConfig = require('../dist/config/jwt.config').default;
const { UsersModule } = require('../dist/users/users.module');
const { AuthModule } = require('../dist/auth/auth.module');
const { ProjectsModule } = require('../dist/projects/projects.module');
const { TasksModule } = require('../dist/tasks/tasks.module');
const { CommentsModule } = require('../dist/comments/comments.module');
const { NotificationsModule } = require('../dist/notifications/notifications.module');
const { ReportsModule } = require('../dist/reports/reports.module');

describe('TaskFlow API (e2e)', () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [jwtConfig] }),
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(uri),
        DatabaseModelsModule,
        UsersModule,
        AuthModule,
        ProjectsModule,
        TasksModule,
        CommentsModule,
        NotificationsModule,
        ReportsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (mongoServer) await mongoServer.stop();
  });

  describe('Auth (FR-001)', () => {
    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' })
        .expect(401);
    });

    it('should reject short password (NFR-006)', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'Ab1!' })
        .expect(400);
    });
  });

  describe('Users (FR-002)', () => {
    it('GET /api/users should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Projects (FR-004)', () => {
    it('GET /api/projects should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Tasks (FR-005)', () => {
    it('GET /api/tasks should return array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Reports (FR-009)', () => {
    it('GET /api/reports/project/:id should 404', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/project/000000000000000000000000')
        .expect(404);
    });

    it('GET /api/reports/employee/:id should 404', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/employee/000000000000000000000000')
        .expect(404);
    });
  });
});
