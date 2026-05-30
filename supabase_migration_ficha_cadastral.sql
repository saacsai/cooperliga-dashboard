-- Migration: ficha cadastral completa — usuários (RH), clientes e agregados
-- Rodar no Supabase SQL Editor do projeto CooperLiga

-- ── Usuários: ficha RH ─────────────────────────────────────────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cep TEXT;

-- ── Clientes: enriquecimento CNPJ ──────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email TEXT;

-- Garantir que tipo tem DEFAULT para inserts sem o campo
ALTER TABLE clientes ALTER COLUMN tipo SET DEFAULT 'cooperativa';

-- ── Agregados: enriquecimento CNPJ ─────────────────────────────
ALTER TABLE agregados ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE agregados ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE agregados ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE agregados ADD COLUMN IF NOT EXISTS cep TEXT;
