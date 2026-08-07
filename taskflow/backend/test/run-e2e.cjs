// Standalone e2e smoke runner (no jest) — mirrors app.e2e-spec.cjs.
// Requires the backend to be built first:  npm run build
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
      UsersModule,
      AuthModule,
      ProjectsModule,
      TasksModule,
      CommentsModule,
      NotificationsModule,
      ReportsModule,
    ],
    providers: [
      // Mirror production AppModule: secure-by-default global guards.
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const http = app.getHttpServer();

  // Seed an admin through the real service, then log in over HTTP.
  const usersService = moduleFixture.get(UsersService);
  await usersService.create({
    firstName: 'E2E',
    lastName: 'Admin',
    email: 'e2e.admin@taskflow.dev',
    password: 'DemoPass123!',
    role: 'Administrator',
  });

  let r = await request(http).post('/api/auth/login').send({
    email: 'e2e.admin@taskflow.dev', password: 'DemoPass123!',
  });
  assert(r.status === 200 && !!r.body.accessToken, 'logs in and returns an access token');
  const adminToken = r.body.accessToken;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  // Auth (FR-001)
  console.log('Auth (FR-001):');
  r = await request(http).post('/api/auth/login').send({ email: 'nonexistent@test.com', password: 'wrong' });
  assert(r.status === 401, 'rejects invalid credentials');

  r = await request(http).post('/api/auth/login').send({ email: 'e2e.admin@taskflow.dev', password: 'Ab1!' });
  assert(r.status === 401, 'rejects short password without issuing a session (401)');

  // Users (FR-002)
  console.log('\nUsers (FR-002):');
  r = await request(http).get('/api/users').set(auth());
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/users returns array (authenticated)');

  // Projects (FR-004)
  console.log('\nProjects (FR-004):');
  r = await request(http).get('/api/projects').set(auth());
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/projects returns array (authenticated)');

  r = await request(http).get('/api/projects');
  assert(r.status === 401, 'GET /api/projects without a session is rejected');

  // Tasks (FR-005)
  console.log('\nTasks (FR-005):');
  r = await request(http).get('/api/tasks').set(auth());
  assert(r.status === 200 && Array.isArray(r.body), 'GET /api/tasks returns array (authenticated)');

  // Comments (FR-007)
  console.log('\nComments (FR-007):');
  r = await request(http).get('/api/tasks/000000000000000000000000/comments').set(auth());
  assert(r.status === 404, 'GET /api/tasks/:id/comments 404s for an unknown task (ProjectMemberGuard)');

  // Reports (FR-009)
  console.log('\nReports (FR-009):');
  r = await request(http).get('/api/reports/project/000000000000000000000000').set(auth());
  assert(r.status === 404, 'GET /api/reports/project/:id returns 404 for unknown project');

  r = await request(http).get('/api/reports/employee/000000000000000000000000').set(auth());
  assert(r.status === 404, 'GET /api/reports/employee/:id returns 404 for unknown employee');

  await app.close();
  await mongoServer.stop();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
