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
      // Tarifa mínima del Anexo I: reunión con el cliente 2026-08-04 —
      // NO es un piso aparte, la tarifa base YA es el mínimo del servicio.
      // 0 = sin piso extra (queda inerte; se deja configurable por si vuelve
      // a pedirse un piso separado del futuro).
      deliveryMinFee: parseFloat(process.env.APP_DELIVERY_MIN_FEE as string) || 0,
      // Recargo nocturno del Anexo I (§59): aplica entre 11:00pm y 5:30am,
      // hora de Bogotá. 100% para el repartidor (no se reparte con Mándalo,
      // mismo criterio que el resto de la tarifa base que le queda al
      // repartidor una vez descontado `deliveryBaseMandaloCut`).
      deliveryNightSurcharge:
        parseFloat(process.env.APP_DELIVERY_NIGHT_SURCHARGE as string) ||
        4500,
      // Recargo por condiciones climáticas del Anexo I (§59): se activa si
      // Open-Meteo reporta LLUVIA FUERTE EN VIVO (>= `weatherHeavyRainMm`,
      // reunión 2026-08-04) en las coordenadas del negocio (WeatherService,
      // caché de 15 min — decisión provisional de quién se lo queda, ver
      // deliveryNightSurcharge arriba).
      deliveryWeatherSurcharge:
        parseFloat(process.env.APP_DELIVERY_WEATHER_SURCHARGE as string) ||
        2500,
      // Umbral de "lluvia fuerte" (mm de precipitación en la última hora,
      // dato `current.precipitation` de Open-Meteo) que activa el recargo
      // climático — 7.5mm/h es el corte estándar de "lluvia fuerte" (WMO).
      weatherHeavyRainMm:
        parseFloat(process.env.APP_WEATHER_HEAVY_RAIN_MM as string) || 7.5,
      // Recargo por alta demanda del Anexo I: reunión 2026-08-04 — se activa
      // si hay `deliveryDemandThreshold` o más pedidos EN TODA LA APP (no por
      // negocio) esperando repartidor (PREP sin `deliveryUserId`) al momento
      // del cálculo.
      deliveryDemandSurcharge:
        parseFloat(process.env.APP_DELIVERY_DEMAND_SURCHARGE as string) ||
        2500,
      deliveryDemandThreshold:
        parseInt(process.env.APP_DELIVERY_DEMAND_THRESHOLD as string, 10) ||
        30,
      // Segundo intento de entrega del Anexo I (§59, Art. 31/32 TYC): cargo
      // único (un solo reintento por pedido) cuando el cliente decide
      // reintentar tras una entrega fallida. 100% para el repartidor.
      deliveryRetryFee:
        parseFloat(process.env.APP_DELIVERY_RETRY_FEE as string) || 6000,
      // Minutos de espera en el sitio (reunión 2026-08-04) desde que el
      // repartidor marca "En sitio" hasta que se habilita el segundo intento
      // pagado (`retryAfterTimeout`) — se reinicia si se usa el segundo intento.
      deliveryWaitMinutes:
        parseInt(process.env.APP_DELIVERY_WAIT_MINUTES as string, 10) || 5,
      // Comisión por defecto del NEGOCIO sobre lo vendido (subtotal) — cada
      // negocio guarda SU propia tasa (organizational.commissionOrderRate,
      // editable por el admin); esto solo sirve de default al crear uno nuevo.
      defaultCommissionOrderRate:
        parseFloat(process.env.APP_DEFAULT_COMMISSION_ORDER_RATE as string) ||
        5,
      // Tarifa de servicio que se le cobra al CLIENTE encima del subtotal
      // (SIN domicilio): `serviceFeePercent`% del subtotal, con tope
      // `serviceFeeCap`, 100% ingreso de Mándalo (no se reparte con el
      // negocio ni el repartidor). Reunión con el cliente 2026-08-04: vuelve
      // a 5% con tope $5.000 (el tope se alcanza justo en subtotal $100.000
      // — "5%, $5k a partir de los 100k, como estaba antes"). `serviceFeeCap`
      // en 0 = sin tope.
      serviceFeePercent:
        parseFloat(process.env.APP_SERVICE_FEE_PERCENT as string) || 5,
      serviceFeeCap:
        parseFloat(process.env.APP_SERVICE_FEE_CAP as string) || 5000,
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
