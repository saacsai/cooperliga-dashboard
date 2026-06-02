-- Migration: ciclos + ciclo_entregas + unique em produtos
-- Rodar no Supabase SQL Editor (idempotente)

-- Unique em produtos.nome para upsert do worker
CREATE UNIQUE INDEX IF NOT EXISTS produtos_nome_unique ON produtos (nome);

-- Ciclos de entrega
CREATE TABLE IF NOT EXISTS ciclos (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido  text NOT NULL,
  contrato_id    uuid REFERENCES contratos(id) ON DELETE SET NULL,
  data_entrega   date NOT NULL,
  data_receber   date,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (numero_pedido)
);

-- Quantidades por PDE × produto por ciclo
CREATE TABLE IF NOT EXISTS ciclo_entregas (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ciclo_id             uuid NOT NULL REFERENCES ciclos(id) ON DELETE CASCADE,
  rota_id              uuid REFERENCES rotas(id) ON DELETE SET NULL,
  ponto_de_entrega_id  uuid NOT NULL REFERENCES pontos_de_entrega(id) ON DELETE CASCADE,
  produto_id           uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  qtde_inteira         integer NOT NULL DEFAULT 0,
  qtde_fracionada      integer NOT NULL DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  UNIQUE (ciclo_id, ponto_de_entrega_id, produto_id)
);

-- RLS: leitura/escrita pública (mesma política das outras tabelas)
ALTER TABLE ciclos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciclo_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ciclos_all"         ON ciclos;
DROP POLICY IF EXISTS "ciclo_entregas_all" ON ciclo_entregas;

CREATE POLICY "ciclos_all"         ON ciclos        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ciclo_entregas_all" ON ciclo_entregas FOR ALL USING (true) WITH CHECK (true);
