import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Minimal runtime environment validation.
// Fail fast with a clear error when important env vars are missing.
function assertEnv(name: string) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// Required for database connection and secure JWT signing.
assertEnv('MONGODB_URI');
// The JWT secrets have safe defaults for local development but
// should be provided in production. We still warn/require them here.
assertEnv('JWT_ACCESS_SECRET');
assertEnv('JWT_REFRESH_SECRET');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — allow the Next.js frontend (localhost:3001) to send cross-origin
  // requests with credentials (cookies). Required for JWT HTTP-only cookie auth.
  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
  });

  // cookie-parser enables reading HTTP-only cookies in request.cookies.
  // Required by JwtStrategy to extract access_token from cookies.
  app.use(cookieParser());

  // Global ValidationPipe — runs DTO validation on every incoming request.
  //
  // whitelist: true        — strips any properties not declared in the DTO.
  //                          If a client sends { email, password, isAdmin: true },
  //                          isAdmin is silently removed before reaching the controller.
  //                          This prevents mass-assignment attacks.
  //
  // forbidNonWhitelisted: true — instead of silently stripping unknown properties,
  //                          throws a 400 error. Forces clients to send only
  //                          what the DTO expects. Stricter and more explicit.
  //
  // transform: true        — automatically transforms incoming JSON into the DTO class
  //                          instance. Without this, the controller receives a plain
  //                          object, not a CreateUserDto instance.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global API prefix — all routes will be prefixed with /api
  // e.g. POST /api/auth/login, GET /api/users
  // This follows REST API best practices and makes it easy to route
  // traffic to the API vs static assets on the same domain.
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application running on: http://localhost:${port}/api`);
}

bootstrap();
