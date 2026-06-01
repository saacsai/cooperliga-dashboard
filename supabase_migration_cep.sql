-- Migration: campos CEP em pontos_de_entrega e rotas
-- Rodar no Supabase SQL Editor (idempotente)

ALTER TABLE pontos_de_entrega
  ADD COLUMN IF NOT EXISTS cep text;

ALTER TABLE rotas
  ADD COLUMN IF NOT EXISTS cep_referencia text;

ALTER TABLE pontos_de_entrega
  ADD COLUMN IF NOT EXISTS bairro text;
