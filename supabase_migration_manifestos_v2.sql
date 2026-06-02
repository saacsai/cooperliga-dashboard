-- Migration: tabela manifestos com número permanente por (ciclo, rota)
-- Rodar no Supabase SQL Editor (idempotente)

CREATE TABLE IF NOT EXISTS manifestos (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ciclo_id   uuid NOT NULL REFERENCES ciclos(id)  ON DELETE CASCADE,
  rota_id    uuid NOT NULL REFERENCES rotas(id)   ON DELETE CASCADE,
  numero     BIGINT GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz DEFAULT now(),
  UNIQUE (ciclo_id, rota_id)
);

-- Backfill pares já existentes em ciclo_entregas (preserva ordem por ciclo criado)
INSERT INTO manifestos (ciclo_id, rota_id)
SELECT DISTINCT ce.ciclo_id, ce.rota_id
FROM ciclo_entregas ce
JOIN ciclos c  ON c.id = ce.ciclo_id
JOIN rotas  r  ON r.id = ce.rota_id
WHERE ce.rota_id IS NOT NULL
ORDER BY c.created_at, r.codigo
ON CONFLICT (ciclo_id, rota_id) DO NOTHING;

-- RLS
ALTER TABLE manifestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manifestos_all" ON manifestos;
CREATE POLICY "manifestos_all" ON manifestos FOR ALL USING (true) WITH CHECK (true);
