# backend-mandalo

Backend NestJS 11 + TypeORM + PostgreSQL (gestor `pnpm`). Misma base que `lcdp/backend-lcdp`: `config.ts`, `main.ts` (helmet, CORS, Swagger en `/docs`, throttler, `ApiKeyGuard`), `SharedModule.forRoot()` con la conexión TypeORM, y andamiaje de autenticación con `User` + `AccessSessions`.

## Requisitos

- Node 22+
- pnpm
- PostgreSQL

## Puesta en marcha

```bash
pnpm install
# Ajusta .env.development (DB_*, JWT_SECRET_KEY, APP_CLIENT_API_KEY, SWAGGER_*)
pnpm run migration:run      # crea tablas + seed superadmin
pnpm run start:dev
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs (usuario/clave de `SWAGGER_USER`/`SWAGGER_PASSWORD`)
- Health: `GET /health`

Todas las rutas (salvo las marcadas con `@SkipApiKey()`, `/docs` y `/health`) exigen el header `X-Client-Key` = `APP_CLIENT_API_KEY`.

## Auth

- `POST /auth/sign-in` `{ email, password }` → tokens + `accessSessionId` (marcado `@SkipApiKey`).
- `POST /auth/refresh-token` `{ refreshToken }`.
- `POST /auth/sign-out` `{ userId, accessToken, accessSessionId }` (Bearer).

**Credenciales seed** (cambiar en prod): `admin@mandalo.com` / `Admin@123`.

## Migraciones

```bash
pnpm run migration:generate --name=NombreMigracion
pnpm run migration:run
pnpm run migration:revert
```

> En bash/pnpm el placeholder `%npm_config_name%` no expande; para generar migraciones usa:
> `npx ts-node ./node_modules/typeorm/cli -d typeorm.config.ts migration:generate ./src/migrations/Nombre`
