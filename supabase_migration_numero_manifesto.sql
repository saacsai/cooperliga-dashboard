-- Migration: numero auto-incremento para ciclos (número do manifesto)
-- Rodar no Supabase SQL Editor (idempotente)

ALTER TABLE ciclos ADD COLUMN IF NOT EXISTS numero BIGINT;

-- Backfill ciclos existentes em ordem cronológica
WITH rn AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS n FROM ciclos WHERE numero IS NULL
)
UPDATE ciclos SET numero = rn.n FROM rn WHERE ciclos.id = rn.id;

-- Sequência começando após o maior número existente
CREATE SEQUENCE IF NOT EXISTS ciclos_numero_seq;
SELECT setval('ciclos_numero_seq', COALESCE((SELECT MAX(numero) FROM ciclos), 0));

-- Default automático para novos ciclos
ALTER TABLE ciclos ALTER COLUMN numero SET DEFAULT nextval('ciclos_numero_seq');
