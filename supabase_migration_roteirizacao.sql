-- Fase 3: Roteirização Inteligente
-- Adiciona lat/lng em pontos_de_entrega e cria tabelas de sessão de roteirização

ALTER TABLE pontos_de_entrega
  ADD COLUMN IF NOT EXISTS lat        float,
  ADD COLUMN IF NOT EXISTS lng        float,
  ADD COLUMN IF NOT EXISTS geo_status text DEFAULT 'pendente';

-- 'pendente' | 'ok' | 'sem_endereco' | 'nao_encontrado'

CREATE TABLE IF NOT EXISTS roteirizacao_sessoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id    uuid        REFERENCES contratos(id),
  regiao         text        NOT NULL,
  tipo_gr        text        NOT NULL CHECK (tipo_gr IN ('estado', 'municipal')),
  num_produtos   int         NOT NULL DEFAULT 1,
  carga_dobrada  boolean     NOT NULL DEFAULT false,
  max_entregas   int         NOT NULL DEFAULT 25,
  status         text        NOT NULL DEFAULT 'rascunho',
  data_ciclo     text,
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roteirizacao_rotas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id      uuid        NOT NULL REFERENCES roteirizacao_sessoes(id) ON DELETE CASCADE,
  ordem          int         NOT NULL,
  veiculo_tipo   text,
  agregado_id    uuid        REFERENCES agregados(id),
  total_entregas int,
  total_caixas   int,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roteirizacao_pontos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id     uuid        NOT NULL REFERENCES roteirizacao_rotas(id) ON DELETE CASCADE,
  ponto_id    uuid        NOT NULL REFERENCES pontos_de_entrega(id),
  ordem       int         NOT NULL,
  qtde_caixas int,
  gr_numeros  text[],
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: admins e gestores gerenciam sessões; analistas e operadores apenas leem
ALTER TABLE roteirizacao_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteirizacao_rotas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteirizacao_pontos  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessoes_acesso" ON roteirizacao_sessoes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.perfil IN ('admin','gestor','analista','operador')
    )
  );

CREATE POLICY "rotas_acesso" ON roteirizacao_rotas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.perfil IN ('admin','gestor','analista','operador')
    )
  );

CREATE POLICY "pontos_rot_acesso" ON roteirizacao_pontos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.perfil IN ('admin','gestor','analista','operador')
    )
  );
