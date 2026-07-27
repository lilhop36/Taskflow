import { registerAs } from '@nestjs/config';

/**
 * Typed configuration factory for JWT authentication settings.
 *
 * Benefits of registerAs:
 * - Namespace isolation: Access configuration via 'jwt.accessSecret' or jwtConfig.KEY.
 * - Type Safety: Provides strongly-typed configuration objects throughout the application.
 * - Centralized Defaults: Defines fallback values if environment variables are missing.
 */
export default registerAs('jwt', () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET ||
    'taskflow_access_secret_change_in_production',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'taskflow_refresh_secret_change_in_production',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
