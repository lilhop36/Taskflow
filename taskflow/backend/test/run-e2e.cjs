
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

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

async function main() {
  console.log('\nTaskFlow E2E Smoke Tests\n');

  const mongoServer = await MongoMemoryServer.create();
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

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const http = app.getHttpServer();

  // Auth (FR-001)
  console.log('Auth (FR-001):');
  let r = await request(http).post('/api/auth/login').send({ email: 'x@y.z', password: 'wrong' });
  assert(r.status === 401, 'rejects invalid credentials');

  r = await request(http).post('/api/auth/login').send({ email: 'a@b.com', password: 'Ab1!' });
  assert(r.status === 400, 'rejects short password (NFR-006)');

  // Users (FR-002)
  console.log('\nUsers (FR-002):');
  r = await request(http).get('/api/users');
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/users returns array');

  // Projects (FR-004)
  console.log('\nProjects (FR-004):');
  r = await request(http).get('/api/projects');
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/projects returns array');

  // Tasks (FR-005)
  console.log('\nTasks (FR-005):');
  r = await request(http).get('/api/tasks');
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/tasks returns array');

  // Comments (FR-007)
  console.log('\nComments (FR-007):');
  r = await request(http).get('/api/tasks/000000000000000000000000/comments');
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/tasks/:id/comments returns array');

  // Reports (FR-009)
  console.log('\nReports (FR-009):');
  r = await request(http).get('/api/reports/project/000000000000000000000000');
  assert(r.status === 404, 'GET /api/reports/project/:id returns 404 for unknown project');

  r = await request(http).get('/api/reports/employee/000000000000000000000000');
  assert(r.status === 404, 'GET /api/reports/employee/:id returns 404 for unknown employee');

  await app.close();
  await mongoServer.stop();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
