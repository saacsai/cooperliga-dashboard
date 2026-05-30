-- Migration: auto-populate — adiciona constraints UNIQUE necessários para upsert do worker
-- Rodar no Supabase SQL Editor

-- Permite upsert por codigo_prefeitura (worker Municipal)
ALTER TABLE pontos_de_entrega
    ADD CONSTRAINT pontos_codigo_prefeitura_unique UNIQUE (codigo_prefeitura);

-- Permite upsert de clientes por nome (cooperativa do XLS de GRs)
ALTER TABLE clientes
    ADD CONSTRAINT clientes_nome_unique UNIQUE (nome);
