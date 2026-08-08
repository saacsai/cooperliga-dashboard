-- CEAF: Cesta de Agricultura Familiar
-- Módulo de Vendas Diretas ao Consumidor Corporativo

-- Empresas parceiras (UNIFORJA, outras)
CREATE TABLE IF NOT EXISTS ceaf_empresas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome             TEXT NOT NULL,
  cnpj             TEXT,
  razao_social     TEXT,
  endereco_entrega TEXT,
  municipio        TEXT,
  cep              TEXT,
  contato_nome     TEXT,
  contato_whatsapp TEXT,
  email            TEXT,
  ativa            BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Funcionários das empresas parceiras
CREATE TABLE IF NOT EXISTS ceaf_funcionarios (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id          UUID REFERENCES ceaf_empresas(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  whatsapp            TEXT NOT NULL,
  preferencias_nunca  JSONB DEFAULT '[]',  -- lista de produto_ids que nunca quer
  ativo               BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos CEAF disponíveis para venda direta
CREATE TABLE IF NOT EXISTS ceaf_produtos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('folhosa','legume','fruta','grao','processado','outro')),
  unidade         TEXT DEFAULT 'unidade',
  preco_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  disponivel      BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Cardápio semanal (quais produtos estão disponíveis em cada semana)
CREATE TABLE IF NOT EXISTS ceaf_cardapio (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semana_ref           DATE NOT NULL,  -- segunda-feira da semana
  produto_id           UUID REFERENCES ceaf_produtos(id) ON DELETE CASCADE,
  quantidade_cx        INTEGER,        -- caixas disponíveis estimadas
  preco_semana         NUMERIC(10,2),  -- pode diferir do preço padrão
  ativo                BOOLEAN DEFAULT TRUE,
  UNIQUE (semana_ref, produto_id)
);

-- Ciclo de vendas (rodada da Feira no Trabalho por empresa)
CREATE TABLE IF NOT EXISTS ceaf_ciclos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semana_ref       DATE NOT NULL,
  empresa_id       UUID REFERENCES ceaf_empresas(id),
  status           TEXT DEFAULT 'aberto' CHECK (status IN ('aberto','fechado','consolidado','entregue')),
  data_cardapio    DATE,      -- segunda: cardápio vai para o WhatsApp
  data_fechamento  DATE,      -- quarta: pedidos fecham
  data_entrega     DATE,      -- sexta: entrega e montagem
  veiculo_sugerido TEXT,      -- calculado automaticamente pelo total de caixas
  total_caixas     INTEGER DEFAULT 0,
  valor_frete      NUMERIC(10,2),
  plus_montagem    NUMERIC(10,2),
  observacao       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos individuais (um por funcionário por ciclo)
CREATE TABLE IF NOT EXISTS ceaf_pedidos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ciclo_id        UUID REFERENCES ceaf_ciclos(id) ON DELETE CASCADE,
  funcionario_id  UUID REFERENCES ceaf_funcionarios(id),
  status          TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  valor_total     NUMERIC(10,2) DEFAULT 0,
  slot_retirada   TEXT,           -- ex: '08:00-09:00'
  pago_em         TIMESTAMPTZ,
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Itens de cada pedido
CREATE TABLE IF NOT EXISTS ceaf_pedidos_itens (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id        UUID REFERENCES ceaf_pedidos(id) ON DELETE CASCADE,
  produto_id       UUID REFERENCES ceaf_produtos(id),
  quantidade       INTEGER NOT NULL DEFAULT 1,
  preco_unitario   NUMERIC(10,2) NOT NULL,
  substituto_de    UUID REFERENCES ceaf_produtos(id)  -- preenchido se houve substituição
);

-- RLS: acesso restrito por perfil (admin/gestor)
ALTER TABLE ceaf_empresas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_produtos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_cardapio    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_ciclos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_pedidos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceaf_pedidos_itens ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para usuários autenticados (auth gerenciada pelo dashboard)
CREATE POLICY "Autenticados leem ceaf_empresas"     ON ceaf_empresas     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_funcionarios" ON ceaf_funcionarios  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_produtos"     ON ceaf_produtos     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_cardapio"     ON ceaf_cardapio     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_ciclos"       ON ceaf_ciclos       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_pedidos"      ON ceaf_pedidos      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Autenticados leem ceaf_pedidos_itens" ON ceaf_pedidos_itens FOR ALL USING (auth.role() = 'authenticated');
