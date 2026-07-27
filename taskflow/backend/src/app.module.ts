import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import jwtConfig from './config/jwt.config';
import { DatabaseModule } from './database/database.module';
import { DatabaseModelsModule } from './database/models/database-models.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

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

    // AuthModule encapsulates User authentication, Passport JWT strategy, and session tokens.
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
