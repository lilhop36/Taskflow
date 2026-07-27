import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import jwtConfig from './config/jwt.config';
import { DatabaseModule } from './database/database.module';
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

    // DatabaseModule establishes the MongoDB connection.
    // It must be imported after ConfigModule so ConfigService is available.
    DatabaseModule,

    // UsersModule encapsulates User schema, repository, service, and controller.
    UsersModule,

    // AuthModule encapsulates User authentication, Passport JWT strategy, and session tokens.
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
