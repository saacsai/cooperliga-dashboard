-- Migration: contratos + contrato_id em pontos_de_entrega
-- Rodar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contratos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id  UUID NOT NULL REFERENCES clientes(id),
    orgao       TEXT NOT NULL,
    numero      TEXT,
    tipo_gr     TEXT CHECK (tipo_gr IN ('estado', 'municipal')),
    descricao   TEXT,
    ativo       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pontos_de_entrega
    ADD COLUMN IF NOT EXISTS contrato_id UUID REFERENCES contratos(id);

ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticado_le_contratos"
    ON contratos FOR SELECT TO authenticated USING (true);

CREATE POLICY "autenticado_escreve_contratos"
    ON contratos FOR ALL TO authenticated USING (true) WITH CHECK (true);
