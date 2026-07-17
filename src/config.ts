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
      // Tarifa fija del domicilio (COP). Por distancia = fase 2.
      deliveryFee: parseFloat(process.env.APP_DELIVERY_FEE as string) || 0,
      // Minutos de entrega por defecto cuando faltan coordenadas para
      // estimar por distancia (negocio o dirección sin lat/lng).
      deliveryEtaMinutes:
        parseInt(process.env.APP_DELIVERY_ETA_MINUTES as string, 10) || 20,
      // Radio (km) de cercanía: negocios que ve el cliente en el explorar y
      // pedidos disponibles que ve el repartidor.
      nearbyRadiusKm:
        parseFloat(process.env.APP_NEARBY_RADIUS_KM as string) || 10,
      // Comisión de la plataforma al NEGOCIO (toda la plata se trata con él;
      // al repartidor no se le cobra): % sobre lo vendido (subtotal) y %
      // sobre los domicilios de los pedidos entregados.
      commissionOrderRate:
        parseFloat(process.env.APP_COMMISSION_ORDER_RATE as string) || 5,
      commissionDeliveryRate:
        parseFloat(process.env.APP_COMMISSION_DELIVERY_RATE as string) || 20,
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
    mail: {
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT as string, 10) || 587,
      user: process.env.MAIL_USER || '',
      password: process.env.MAIL_PASSWORD || '',
      sender: process.env.MAIL_SENDER || 'noreply@mandalo.com',
      secure: process.env.MAIL_SECURE === 'true',
    },
    google: {
      // Client ID "Web application" de Google Cloud Console. Es el audience
      // contra el que se verifica el idToken que manda la app.
      webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
      // Client ID "Android" (opcional, por si el idToken llega con ese audience).
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
    },
  };
};
