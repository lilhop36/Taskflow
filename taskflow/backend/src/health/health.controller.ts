import { Controller, Get } from '@nestjs/common';
import { connection } from 'mongoose';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    // Mongoose connection states: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
    const state = (connection && (connection.readyState as number)) ?? 0;
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
