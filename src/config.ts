export const config = async () => {
  const rawOrigin = process.env.APP_CORS_ORIGIN || '';
  const rawAllowedHeaders = process.env.APP_CORS_ALLOWED_HEADERS || '';
  const rawAllowedMethods = process.env.APP_CORS_ALLOWED_METHODS || '';

  const origin = rawOrigin.split(',').filter((item) => item.trim());
  const allowedHeaders = rawAllowedHeaders
    .split(',')
    .filter((item) => item.trim());
  const allowedMethods = rawAllowedMethods
    .split(',')
    .filter((item) => item.trim());

  return {
    app: {
      name: process.env.APP_NAME || 'MandaloApp',
      port: parseInt(process.env.APP_PORT as string, 10) || 3000,
      env: process.env.APP_ENV || 'development',
      baseUrl: process.env.APP_BASE_URL || '',
      clientApiKey: process.env.APP_CLIENT_API_KEY || '',
      cors: {
        origin,
        allowedHeaders: allowedHeaders.length ? allowedHeaders : ['*'],
        allowedMethods: allowedMethods.length
          ? allowedMethods
          : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
    },
    jwt: {
      secret: process.env.JWT_SECRET_KEY || 'default-secret-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d',
    },
    swagger: {
      user: process.env.SWAGGER_USER || 'admin',
      password: process.env.SWAGGER_PASSWORD || 'password',
    },
    db: {
      type: process.env.DB_TYPE || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT as string, 10) || 5432,
      database: process.env.DB_DATABASE || 'mandalo_db',
      user: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.DB_SSL === 'true',
    },
  };
};
