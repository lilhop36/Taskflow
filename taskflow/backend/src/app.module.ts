import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import jwtConfig from './config/jwt.config';
import { DatabaseModule } from './database/database.module';
import { DatabaseModelsModule } from './database/models/database-models.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    // ConfigModule loads the .env file and makes environment variables
    // available throughout the entire application via ConfigService.
    // Setting isGlobal: true means we don't need to import ConfigModule
    // again in every feature module — it's available everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [jwtConfig],
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().uri().required(),
        JWT_ACCESS_SECRET: Joi.string().min(10).required(),
        JWT_REFRESH_SECRET: Joi.string().min(10).required(),
        PORT: Joi.number().optional(),
      }),
    }),

    // EventEmitterModule enables the NestJS event system.
    // Used by TasksService and CommentsService to emit domain events,
    // and by NotificationListener to react and create notification records.
    // FR-008.1-4: event-driven notification infrastructure.
    EventEmitterModule.forRoot(),

    // DatabaseModule establishes the MongoDB connection.
    // It must be imported after ConfigModule so ConfigService is available.
    DatabaseModule,

    // DatabaseModelsModule registers all Mongoose schemas globally.
    // Any module can inject any model without importing the originating feature module.
    DatabaseModelsModule,

    // UsersModule encapsulates User schema, repository, service, and controller.
    UsersModule,

    // ProjectsModule encapsulates Project schema, repository, service, and controller.
    ProjectsModule,

    // TasksModule encapsulates Task schema, repository, service, and controller.
    TasksModule,

    // CommentsModule enables task-level comment threads (FR-007.1-3).
    // Imports TasksModule for task existence verification.
    CommentsModule,

    // NotificationsModule powers the event-driven notification system (FR-008.1-4).
    // Its NotificationListener subscribes to events emitted by Tasks and Comments.
    NotificationsModule,

    // ReportsModule aggregates project and employee data for reports (FR-009.1-3).
    ReportsModule,

    // TeamsModule enables team creation and member management (FR-003.1-3).
    TeamsModule,

    // AuthModule encapsulates User authentication, Passport JWT strategy, and session tokens.
    AuthModule,
    // Health checks and readiness endpoint
    HealthModule,
  ],
  controllers: [],
  providers: [
    // APP_GUARD is a special NestJS token that registers a guard globally.
    // Every HTTP request will pass through these guards in the order declared.
    //
    // Guard execution order:
    //   1. JwtAuthGuard — verifies JWT and populates request.user
    //                     Routes marked @Public() bypass this guard entirely.
    //   2. RolesGuard   — reads @Roles() metadata and checks request.user.role
    //                     Routes without @Roles() pass through without restriction.
    //
    // This "secure by default" approach means every new route is automatically
    // protected. Developers must explicitly use @Public() or @Roles() to control
    // access — they cannot accidentally leave a sensitive route unguarded.
    //
    // BR-001: Role-Based Authorization Hierarchy (Admin > PM > Employee)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
