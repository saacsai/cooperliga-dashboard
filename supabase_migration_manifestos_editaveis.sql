-- Migration: manifestos editáveis com pontos independentes e suporte a duplicatas (14B, 14C...)
-- Rodar no Supabase SQL Editor

-- 1. Novas colunas em ciclo_manifestos
ALTER TABLE ciclo_manifestos
  ADD COLUMN IF NOT EXISTS letra       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS numero_base bigint;

-- 2. Backfill numero_base para os registros existentes
UPDATE ciclo_manifestos SET numero_base = numero WHERE numero_base IS NULL;

-- 3. Trigger: ao inserir sem numero_base explícito, herda o próprio numero (para o worker)
CREATE OR REPLACE FUNCTION fn_ciclo_manifestos_numero_base()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_base IS NULL THEN
    NEW.numero_base := NEW.numero;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ciclo_manifestos_numero_base ON ciclo_manifestos;
CREATE TRIGGER trg_ciclo_manifestos_numero_base
  BEFORE INSERT ON ciclo_manifestos
  FOR EACH ROW EXECUTE FUNCTION fn_ciclo_manifestos_numero_base();

-- 4. NOT NULL após backfill
ALTER TABLE ciclo_manifestos ALTER COLUMN numero_base SET NOT NULL;

-- 5. Atualiza unique constraint para incluir letra
ALTER TABLE ciclo_manifestos DROP CONSTRAINT IF EXISTS ciclo_manifestos_data_entrega_rota_id_key;
ALTER TABLE ciclo_manifestos DROP CONSTRAINT IF EXISTS ciclo_manifestos_data_rota_letra_key;
ALTER TABLE ciclo_manifestos ADD CONSTRAINT ciclo_manifestos_data_rota_letra_key
  UNIQUE (data_entrega, rota_id, letra);

-- 6. Tabela de pontos por manifesto (independente de rota_pontos)
CREATE TABLE IF NOT EXISTS manifesto_pontos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  manifesto_id uuid NOT NULL REFERENCES ciclo_manifestos(id) ON DELETE CASCADE,
  pde_id       uuid NOT NULL REFERENCES pontos_de_entrega(id) ON DELETE CASCADE,
  sequencia    int  NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (manifesto_id, pde_id)
);

-- 7. Backfill: semeia pontos a partir das rotas (ponto de partida padrão)
INSERT INTO manifesto_pontos (manifesto_id, pde_id, sequencia)
SELECT cm.id, rp.ponto_de_entrega_id, rp.sequencia
FROM ciclo_manifestos cm
JOIN rota_pontos rp ON rp.rota_id = cm.rota_id
ON CONFLICT (manifesto_id, pde_id) DO NOTHING;

-- 8. RLS
ALTER TABLE manifesto_pontos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manifesto_pontos_all" ON manifesto_pontos;
CREATE POLICY "manifesto_pontos_all" ON manifesto_pontos FOR ALL USING (true) WITH CHECK (true);
