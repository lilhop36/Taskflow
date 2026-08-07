/**
 * TaskFlow seed script
 * =====================
 *
 * Idempotent data seeder. Safe to run repeatedly — existing records are
 * updated in place (demo passwords are reset), and demo content (team,
 * project, tasks, sprint) is only created once per project name.
 *
 * Usage (from taskflow/backend):
 *
 *   # Minimal: the three demo accounts advertised on the login page.
 *   npm run seed
 *
 *   # Full demo: accounts + a team, a project, tasks and a sprint so the
 *   # dashboard, boards and reports have something to show.
 *   npm run seed -- --demo
 *
 * The backend .env file is loaded automatically when present; you can also
 * pass MONGODB_URI explicitly:
 *
 *   MONGODB_URI=mongodb+srv://... npm run seed -- --demo
 *
 * Demo credentials (all accounts):
 *   admin   · liya@taskflow.dev    · DemoPass123!
 *   manager · abebe@taskflow.dev   · DemoPass123!
 *   member  · hanna@taskflow.dev   · DemoPass123!
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserSchema, UserRole, UserStatus } from '../src/users/schemas/user.schema';
import { Team, TeamSchema } from '../src/teams/schemas/team.schema';
import { Project, ProjectSchema, ProjectStatus } from '../src/projects/schemas/project.schema';
import {
  Task,
  TaskSchema,
  TaskStatus,
  TaskPriority,
} from '../src/tasks/schemas/task.schema';
import { Sprint, SprintSchema, SprintStatus } from '../src/sprints/schemas/sprint.schema';

const DEMO_PASSWORD = 'DemoPass123!';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

interface DemoUser {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'liya@taskflow.dev', firstName: 'Liya', lastName: 'Admin', role: UserRole.ADMIN },
  { email: 'abebe@taskflow.dev', firstName: 'Abebe', lastName: 'Manager', role: UserRole.PROJECT_MANAGER },
  { email: 'hanna@taskflow.dev', firstName: 'Hanna', lastName: 'Member', role: UserRole.TEAM_MEMBER },
  { email: 'david@taskflow.dev', firstName: 'David', lastName: 'Member', role: UserRole.TEAM_MEMBER },
  { email: 'sara@taskflow.dev', firstName: 'Sara', lastName: 'Member', role: UserRole.TEAM_MEMBER },
];

/**
 * Minimal .env loader — reads KEY=VALUE lines into process.env without
 * overwriting variables that are already set (e.g. real deployment env).
 * Keeps the seed script dependency-free instead of pulling in dotenv.
 */
function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function upsertUser(user: DemoUser) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const UserModel = mongoose.model<User>('User', UserSchema);
  const result = await UserModel.updateOne(
    { email: user.email },
    {
      $set: {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    },
    { upsert: true },
  );
  const doc = await UserModel.findOne({ email: user.email }).lean();
  const created = result.upsertedCount > 0;
  console.log(`  ${created ? 'created' : 'updated '}  ${user.email.padEnd(28)} ${user.role}`);
  return doc!._id.toString();
}

async function seedDemoContent(userIds: Record<string, string>) {
  const TeamModel = mongoose.model<Team>('Team', TeamSchema);
  const ProjectModel = mongoose.model<Project>('Project', ProjectSchema);
  const TaskModel = mongoose.model<Task>('Task', TaskSchema);
  const SprintModel = mongoose.model<Sprint>('Sprint', SprintSchema);

  const existing = await ProjectModel.findOne({ name: 'Website Redesign' }).lean();
  if (existing) {
    console.log('  skip    Demo content already exists (project "Website Redesign")');
    return;
  }

  // Team
  const team = await TeamModel.create({
    name: 'Product Studio',
    description: 'Cross-functional team for the website relaunch.',
    members: [
      new mongoose.Types.ObjectId(userIds.hanna),
      new mongoose.Types.ObjectId(userIds.david),
      new mongoose.Types.ObjectId(userIds.sara),
    ],
  });
  console.log('  created  Team "Product Studio"');

  // Project — dates straddle today so the time-progress bar has life.
  const project = await ProjectModel.create({
    name: 'Website Redesign',
    description: 'Reimagine the public site: information architecture, design system, and content migration.',
    startDate: new Date(now - 30 * DAY),
    endDate: new Date(now + 60 * DAY),
    status: ProjectStatus.ACTIVE,
    owner: new mongoose.Types.ObjectId(userIds.abebe),
    members: [
      new mongoose.Types.ObjectId(userIds.hanna),
      new mongoose.Types.ObjectId(userIds.david),
      new mongoose.Types.ObjectId(userIds.sara),
    ],
    teams: [team._id],
  });
  console.log('  created  Project "Website Redesign"');

  // Tasks — mixed statuses, one overdue (shows up as overdue), one Done.
  const tasks = await TaskModel.create([
    {
      title: 'Audit current site structure',
      description: 'Inventory pages, content types, and broken flows on the live site.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.DONE,
      dueDate: new Date(now - 10 * DAY),
      completedAt: new Date(now - 12 * DAY),
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.hanna),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
    {
      title: 'Draft information architecture',
      description: 'Propose the new sitemap and navigation model for stakeholder review.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_REVIEW,
      dueDate: new Date(now + 3 * DAY),
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.sara),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
    {
      title: 'Design homepage hero mockups',
      description: 'Two art-directed directions for the new homepage hero.',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.IN_PROGRESS,
      dueDate: new Date(now + 5 * DAY),
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.david),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
    {
      title: 'Set up staging environment',
      description: 'Provision a deployable staging build with preview URLs.',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      dueDate: new Date(now + 2 * DAY),
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.hanna),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
    {
      title: 'Collect stakeholder feedback',
      description: 'Schedule interviews and capture notes on the proposed IA.',
      priority: TaskPriority.LOW,
      status: TaskStatus.BACKLOG,
      dueDate: new Date(now - 2 * DAY), // overdue — highlights the ember badge
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.david),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
    {
      title: 'Content migration plan',
      description: 'Map legacy pages to the new structure with redirects.',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      dueDate: new Date(now + 1 * DAY),
      project: project._id,
      assignee: new mongoose.Types.ObjectId(userIds.sara),
      createdBy: new mongoose.Types.ObjectId(userIds.abebe),
    },
  ]);
  console.log(`  created  ${tasks.length} tasks for "Website Redesign"`);

  // Sprint — Active so the board and burndown are alive out of the box.
  const sprint = await SprintModel.create({
    name: 'Sprint 1 — Discovery & Design',
    goal: 'Validate the new information architecture and land homepage direction.',
    project: project._id,
    status: SprintStatus.ACTIVE,
    startDate: new Date(now - 7 * DAY),
    endDate: new Date(now + 7 * DAY),
    createdBy: new mongoose.Types.ObjectId(userIds.abebe),
  });

  // Attach all demo tasks to the sprint (unblocks the sprint board).
  await TaskModel.updateMany(
    { project: project._id },
    { $set: { sprintId: sprint._id } },
  );
  console.log('  created  Sprint "Sprint 1 — Discovery & Design" (active)');
}

async function main() {
  loadEnvFile();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Add a backend/.env file or pass the variable.');
    process.exit(1);
  }

  const demo = process.argv.includes('--demo');
  console.log(`Seeding TaskFlow${demo ? ' (full demo)' : ' (users only)'}…`);
  console.log(`Connecting to ${uri.split('@').pop()?.split('?')[0] ?? uri}\n`);

  await mongoose.connect(uri);
  try {
    const userIds: Record<string, string> = {};
    console.log('Demo users:');
    for (const user of DEMO_USERS) {
      userIds[user.email.split('@')[0]] = await upsertUser(user);
    }

    if (demo) {
      console.log('\nDemo content:');
      await seedDemoContent(userIds);
    }

    console.log(`\nDone. Sign in at the login page with any of:\n`);
    for (const user of DEMO_USERS) {
      console.log(`  ${user.role.padEnd(16)} ${user.email.padEnd(28)} ${DEMO_PASSWORD}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
