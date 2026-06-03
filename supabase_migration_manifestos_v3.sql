-- Migration: ciclo_manifestos keyed por (data_entrega, rota_id) em vez de (ciclo_id, rota_id)
-- Rodar no Supabase SQL Editor

DROP TABLE IF EXISTS ciclo_manifestos;

CREATE TABLE ciclo_manifestos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data_entrega date NOT NULL,
  rota_id      uuid NOT NULL REFERENCES rotas(id) ON DELETE CASCADE,
  numero       BIGINT GENERATED ALWAYS AS IDENTITY,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (data_entrega, rota_id)
);

-- Backfill: um manifesto por (data_entrega, rota) a partir dos ciclo_entregas existentes
INSERT INTO ciclo_manifestos (data_entrega, rota_id)
SELECT sub.data_entrega, sub.rota_id FROM (
  SELECT DISTINCT c.data_entrega, ce.rota_id, r.codigo
  FROM ciclo_entregas ce
  JOIN ciclos c ON c.id = ce.ciclo_id
  JOIN rotas  r ON r.id = ce.rota_id
  WHERE ce.rota_id IS NOT NULL
) sub
ORDER BY sub.data_entrega, sub.codigo
ON CONFLICT (data_entrega, rota_id) DO NOTHING;

-- RLS
ALTER TABLE ciclo_manifestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ciclo_manifestos_all" ON ciclo_manifestos;
CREATE POLICY "ciclo_manifestos_all" ON ciclo_manifestos FOR ALL USING (true) WITH CHECK (true);
