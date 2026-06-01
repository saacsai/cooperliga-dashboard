-- Migration: codigo em contratos + contrato_id em rotas
-- Rodar no Supabase SQL Editor (idempotente)

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS codigo text;

ALTER TABLE rotas
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES contratos(id) ON DELETE SET NULL;
