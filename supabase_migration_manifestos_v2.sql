-- Migration: tabela ciclo_manifestos com número permanente por (ciclo, rota)
-- Rodar no Supabase SQL Editor

DROP TABLE IF EXISTS ciclo_manifestos;

CREATE TABLE ciclo_manifestos (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ciclo_id   uuid NOT NULL REFERENCES ciclos(id)  ON DELETE CASCADE,
  rota_id    uuid NOT NULL REFERENCES rotas(id)   ON DELETE CASCADE,
  numero     BIGINT GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz DEFAULT now(),
  UNIQUE (ciclo_id, rota_id)
);

-- Backfill pares já existentes em ciclo_entregas (preserva ordem por ciclo criado)
INSERT INTO ciclo_manifestos (ciclo_id, rota_id)
SELECT ciclo_id, rota_id FROM (
  SELECT DISTINCT ce.ciclo_id, ce.rota_id, c.created_at, r.codigo
  FROM ciclo_entregas ce
  JOIN ciclos c ON c.id = ce.ciclo_id
  JOIN rotas  r ON r.id = ce.rota_id
  WHERE ce.rota_id IS NOT NULL
) sub
ORDER BY sub.created_at, sub.codigo
ON CONFLICT (ciclo_id, rota_id) DO NOTHING;

-- RLS
ALTER TABLE ciclo_manifestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ciclo_manifestos_all" ON ciclo_manifestos;
CREATE POLICY "ciclo_manifestos_all" ON ciclo_manifestos FOR ALL USING (true) WITH CHECK (true);
