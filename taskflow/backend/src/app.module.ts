import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    // ConfigModule loads the .env file and makes environment variables
    // available throughout the entire application via ConfigService.
    // Setting isGlobal: true means we don't need to import ConfigModule
    // again in every feature module — it's available everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // DatabaseModule establishes the MongoDB connection.
    // It must be imported after ConfigModule so ConfigService is available.
    DatabaseModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
