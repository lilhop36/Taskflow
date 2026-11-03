import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Public } from '../common/guards/jwt-auth.guard';

// @Public() bypasses the global JwtAuthGuard — platform health checks
// (Render, Fly, k8s) probe this endpoint without credentials.
@Public()
@Controller('health')
export class HealthController {
  // Inject the connection MongooseModule.forRootAsync actually created.
  // Importing `connection` from the mongoose package would report the
  // library's default connection, which createConnection-based setups
  // never use — the gauge would read "disconnected" forever.
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  health() {
    // Mongoose connection states: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
    const state = this.connection?.readyState ?? 0;
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: 'ok',
      db: states[state] ?? state,
      timestamp: new Date().toISOString(),
    };
  }
}
