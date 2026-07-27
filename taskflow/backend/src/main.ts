import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
