import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — allow the Next.js frontend to send cross-origin requests with
  // credentials (cookies). Required for JWT HTTP-only cookie auth.
  //
  // CORS_ORIGIN accepts a comma-separated list so the same binary runs in
  // dev (default localhost:3000) and production (e.g. the Vercel URL).
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  app.enableCors({
    // Wildcard + credentials is rejected by browsers, so a "*" entry falls
    // back to reflecting the request origin (allow any frontend) instead of
    // silently breaking every credentialed request.
    origin: corsOrigins.includes('*')
      ? (_origin: string, callback: (err: Error | null, allow?: boolean) => void) =>
          callback(null, true)
      : corsOrigins,
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
