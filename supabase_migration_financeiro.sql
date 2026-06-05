-- Fase 2f: Financeiro — pagamentos de agregados
-- Rodar no Supabase SQL Editor

-- Cabeçalho: 1 linha por (agregado × semana trabalhada)
CREATE TABLE IF NOT EXISTS pagamentos_agregados (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  agregado_id      uuid        REFERENCES agregados(id) NOT NULL,
  semana_ref       date        NOT NULL,          -- segunda-feira da semana trabalhada
  data_vencimento  date        NOT NULL,          -- sexta + 21 dias
  valor_total      numeric(10,2) NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'aguardando_nf'
    CHECK (status IN ('aguardando_nf','nf_recebida','aprovado','pago')),
  nf_numero        text,
  observacao       text,
  data_pagamento   date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (agregado_id, semana_ref)
);

-- Itens: 1 linha por manifesto dentro do cabeçalho
CREATE TABLE IF NOT EXISTS pagamentos_itens (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pagamento_id  uuid        REFERENCES pagamentos_agregados(id) ON DELETE CASCADE NOT NULL,
  manifesto_id  uuid        REFERENCES ciclo_manifestos(id) NOT NULL,
  rota_id       uuid        REFERENCES rotas(id),
  valor         numeric(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (manifesto_id)
);

-- RLS
ALTER TABLE pagamentos_agregados ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_itens     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_pagamentos"      ON pagamentos_agregados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_pagamentos_itens" ON pagamentos_itens    FOR ALL TO authenticated USING (true) WITH CHECK (true);
