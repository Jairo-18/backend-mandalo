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
      // Tarifa fija del domicilio (COP): SOLO fallback cuando faltan
      // coordenadas (negocio o dirección sin lat/lng) — el cobro real es por
      // distancia, ver deliveryBase*/deliveryExtra* abajo.
      deliveryFee: parseFloat(process.env.APP_DELIVERY_FEE as string) || 0,
      // Minutos de entrega por defecto cuando faltan coordenadas para
      // estimar por distancia (negocio o dirección sin lat/lng).
      deliveryEtaMinutes:
        parseInt(process.env.APP_DELIVERY_ETA_MINUTES as string, 10) || 20,
      // Radio (km) de cercanía: negocios que ve el cliente en el explorar y
      // pedidos disponibles que ve el repartidor.
      nearbyRadiusKm:
        parseFloat(process.env.APP_NEARBY_RADIUS_KM as string) || 10,
      // Domicilio por distancia: hasta `deliveryBaseKm` se cobra siempre
      // `deliveryBaseFee` (de eso, `deliveryBaseMandaloCut` es para Mándalo y
      // el resto para el repartidor). Pasado ese radio, cada km extra suma
      // `deliveryExtraKmRate`, de lo cual `deliveryExtraMandaloRate`% es para
      // Mándalo y el resto para el repartidor. Toda la plata del domicilio se
      // reparte entre Mándalo y el repartidor — el negocio no la toca.
      // Defaults alineados al Anexo I de los Términos y Condiciones (TYC-001,
      // NOTAS §59): radio base 4km, tarifa base $6.000, $3.000/km extra.
      deliveryBaseKm:
        parseFloat(process.env.APP_DELIVERY_BASE_KM as string) || 4,
      deliveryBaseFee:
        parseFloat(process.env.APP_DELIVERY_BASE_FEE as string) || 6000,
      deliveryBaseMandaloCut:
        parseFloat(process.env.APP_DELIVERY_BASE_MANDALO_CUT as string) ||
        1000,
      deliveryExtraKmRate:
        parseFloat(process.env.APP_DELIVERY_EXTRA_KM_RATE as string) || 3000,
      deliveryExtraMandaloRate:
        parseFloat(process.env.APP_DELIVERY_EXTRA_MANDALO_RATE as string) ||
        16,
      // Tarifa mínima del Anexo I (§59): piso absoluto del valor del
      // domicilio (base + km extra), antes de sumar recargos. 0 = sin piso.
      deliveryMinFee:
        parseFloat(process.env.APP_DELIVERY_MIN_FEE as string) || 10000,
      // Recargo nocturno del Anexo I (§59): aplica entre 11:00pm y 5:30am,
      // hora de Bogotá. 100% para el repartidor (no se reparte con Mándalo,
      // mismo criterio que el resto de la tarifa base que le queda al
      // repartidor una vez descontado `deliveryBaseMandaloCut`).
      deliveryNightSurcharge:
        parseFloat(process.env.APP_DELIVERY_NIGHT_SURCHARGE as string) ||
        4500,
      // Recargo por condiciones climáticas del Anexo I (§59): se activa si
      // Open-Meteo reporta lluvia/tormenta EN VIVO en las coordenadas del
      // negocio (WeatherService, caché de 15 min — ver NOTAS §59, decisión
      // provisional: quién se lo queda, ver deliveryNightSurcharge arriba).
      deliveryWeatherSurcharge:
        parseFloat(process.env.APP_DELIVERY_WEATHER_SURCHARGE as string) ||
        2500,
      // Recargo por alta demanda del Anexo I (§59): heurística provisional
      // (NOTAS §59, no hay tracking de repartidores conectados todavía) —
      // se activa si el negocio tiene `deliveryDemandThreshold` o más pedidos
      // en PREP sin repartidor asignado al momento del cálculo.
      deliveryDemandSurcharge:
        parseFloat(process.env.APP_DELIVERY_DEMAND_SURCHARGE as string) ||
        2500,
      deliveryDemandThreshold:
        parseInt(process.env.APP_DELIVERY_DEMAND_THRESHOLD as string, 10) ||
        3,
      // Segundo intento de entrega del Anexo I (§59, Art. 31/32 TYC): cargo
      // único (un solo reintento por pedido) cuando el cliente decide
      // reintentar tras una entrega fallida. 100% para el repartidor.
      deliveryRetryFee:
        parseFloat(process.env.APP_DELIVERY_RETRY_FEE as string) || 6000,
      // Comisión por defecto del NEGOCIO sobre lo vendido (subtotal) — cada
      // negocio guarda SU propia tasa (organizational.commissionOrderRate,
      // editable por el admin); esto solo sirve de default al crear uno nuevo.
      defaultCommissionOrderRate:
        parseFloat(process.env.APP_DEFAULT_COMMISSION_ORDER_RATE as string) ||
        5,
      // Tarifa de servicio que se le cobra al CLIENTE encima del subtotal
      // (SIN domicilio): `serviceFeePercent`% del subtotal, 100% ingreso de
      // Mándalo (no se reparte con el negocio ni el repartidor, a diferencia
      // de subtotal/deliveryFee). `serviceFeeCap` en 0 = sin tope — así lo
      // exige el Anexo I / Art. 38 de los Términos y Condiciones (7% sin
      // tope, NOTAS §59); se deja configurable por si se vuelve a topar.
      serviceFeePercent:
        parseFloat(process.env.APP_SERVICE_FEE_PERCENT as string) || 7,
      serviceFeeCap: parseFloat(process.env.APP_SERVICE_FEE_CAP as string) || 0,
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
