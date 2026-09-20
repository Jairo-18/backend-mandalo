-- Sign in with Apple (obligatorio para la App Store por ofrecer login con Google).
-- `synchronize` está en false, así que la columna se crea a mano.
-- Correr en la base del VPS ANTES de desplegar el backend.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "appleId" varchar(255);

-- Acelera el findOne por appleId de cada inicio de sesión.
CREATE INDEX IF NOT EXISTS "IDX_user_appleId"
  ON "user" ("appleId");

-- Verificación:
--   SELECT column_name, data_type, character_maximum_length
--   FROM information_schema.columns
--   WHERE table_name = 'user' AND column_name = 'appleId';
