-- Migration: auto-populate — adiciona constraints UNIQUE necessários para upsert do worker
-- Rodar no Supabase SQL Editor (idempotente — pode rodar mais de uma vez)

-- Permite upsert por codigo_prefeitura (worker Municipal)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'pontos_codigo_prefeitura_unique'
  ) THEN
    ALTER TABLE pontos_de_entrega
      ADD CONSTRAINT pontos_codigo_prefeitura_unique UNIQUE (codigo_prefeitura);
  END IF;
END $$;

-- Permite upsert de clientes por nome (cooperativa do XLS de GRs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'clientes_nome_unique'
  ) THEN
    ALTER TABLE clientes
      ADD CONSTRAINT clientes_nome_unique UNIQUE (nome);
  END IF;
END $$;

-- Tabela rota_pontos com UNIQUE para upsert do worker
CREATE TABLE IF NOT EXISTS rota_pontos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rota_id uuid NOT NULL REFERENCES rotas(id) ON DELETE CASCADE,
    ponto_de_entrega_id uuid NOT NULL REFERENCES pontos_de_entrega(id) ON DELETE CASCADE,
    sequencia integer,
    UNIQUE (rota_id, ponto_de_entrega_id)
);

-- Coluna cargo em usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo text;

-- Atualiza check constraint de tipo em clientes (novos tipos de organização)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_tipo_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_tipo_check
  CHECK (tipo IN ('cooperativa', 'associacao', 'oscip', 'empresa_privada', 'orgao_publico', 'outro'));
