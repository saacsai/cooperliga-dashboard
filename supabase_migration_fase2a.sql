-- ============================================================
-- CooperLiga — Fase 2a: Schema completo (23 tabelas)
-- Execute no Supabase SQL Editor do projeto CooperLiga
-- A tabela `usuarios` já existe da migration inicial — pulada
-- ============================================================

-- Sequence para numero_whatsapp dos manifestos
CREATE SEQUENCE IF NOT EXISTS manifestos_seq START 1;

-- Trigger reutilizável para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- CAMADA 1 — CADASTRO
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clientes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome             TEXT NOT NULL,
    tipo             TEXT NOT NULL CHECK (tipo IN ('cooperativa', 'contratante', 'outro')),
    cnpj             TEXT,
    codigo           TEXT UNIQUE,
    contato_nome     TEXT,
    contato_whatsapp TEXT,
    ativo            BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pontos_de_entrega (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome              TEXT NOT NULL,
    codigo_interno    TEXT UNIQUE,
    codigo_estado     TEXT UNIQUE,
    codigo_prefeitura TEXT,
    endereco          TEXT,
    municipio         TEXT,
    cep               TEXT,
    telefone          TEXT,
    cliente_id        UUID REFERENCES clientes(id),
    contato_nome      TEXT,
    ativo             BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produtos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                 TEXT NOT NULL,
    unidade_padrao       TEXT NOT NULL CHECK (unidade_padrao IN ('UNIDADE', 'CAIXA', 'PACOTE')),
    capacidade_por_caixa INTEGER,
    categoria            TEXT,
    ativo                BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- usuarios já existe — garantir coluna updated_at
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS agregados (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           TEXT NOT NULL,
    cpf_cnpj       TEXT,
    chave_pix      TEXT,
    whatsapp       TEXT,
    veiculo_placa  TEXT,
    veiculo_tipo   TEXT,
    ativo          BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CAMADA 2 — LOGÍSTICA
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rotas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo       TEXT UNIQUE NOT NULL,
    nome         TEXT NOT NULL,
    regiao       TEXT,
    agregado_id  UUID REFERENCES agregados(id),
    valor_frete  DECIMAL,
    ativo        BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rota_pontos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rota_id             UUID REFERENCES rotas(id) ON DELETE CASCADE,
    ponto_de_entrega_id UUID REFERENCES pontos_de_entrega(id),
    sequencia           INTEGER NOT NULL,
    ativo               BOOLEAN DEFAULT TRUE,
    UNIQUE (rota_id, sequencia),
    UNIQUE (rota_id, ponto_de_entrega_id)
);

CREATE TABLE IF NOT EXISTS ordens_de_servico (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero      TEXT UNIQUE NOT NULL,
    rota_id     UUID REFERENCES rotas(id),
    data_inicio DATE,
    data_fim    DATE,
    status      TEXT NOT NULL DEFAULT 'programada'
                CHECK (status IN ('programada', 'em_andamento', 'concluida', 'cancelada')),
    observacoes TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manifestos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero           TEXT UNIQUE NOT NULL,
    ordem_id         UUID REFERENCES ordens_de_servico(id),
    rota_id          UUID REFERENCES rotas(id),
    agregado_id      UUID REFERENCES agregados(id),
    regiao           TEXT,
    data_entrega_inicio DATE,
    data_entrega_fim    DATE,
    data_receber        DATE,

    status           TEXT NOT NULL DEFAULT 'programado'
                     CHECK (status IN (
                         'programado', 'carregando_parcial', 'carregado',
                         'entregue', 'retorno_ok', 'retorno_pendencia'
                     )),

    caixas_enviadas          JSONB DEFAULT '{}',
    carregado_por            UUID REFERENCES usuarios(id),
    carregado_em             TIMESTAMPTZ,

    -- Retorno (referencia manifesto anterior da mesma rota)
    manifesto_retorno_ref_id UUID,  -- FK self-ref adicionada abaixo via ALTER
    caixas_esperadas_retorno JSONB DEFAULT '{}',
    caixas_retornadas        JSONB DEFAULT '{}',
    retorno_conferente_id    UUID REFERENCES usuarios(id),
    retorno_confirmado_em    TIMESTAMPTZ,

    numero_sequencial        INTEGER UNIQUE NOT NULL DEFAULT nextval('manifestos_seq'),
    numero_whatsapp          TEXT UNIQUE NOT NULL DEFAULT lpad(nextval('manifestos_seq')::text, 4, '0'),

    pdf_url       TEXT,
    pdf_gerado_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK self-referencial (não pode estar no CREATE TABLE por limitação de parsing)
ALTER TABLE manifestos
    ADD CONSTRAINT fk_manifesto_retorno
    FOREIGN KEY (manifesto_retorno_ref_id)
    REFERENCES manifestos(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_manifestos_numero  ON manifestos(numero);
CREATE INDEX IF NOT EXISTS idx_manifestos_status  ON manifestos(status);
CREATE INDEX IF NOT EXISTS idx_manifestos_rota    ON manifestos(rota_id);
CREATE INDEX IF NOT EXISTS idx_manifestos_regiao  ON manifestos(regiao);

CREATE TRIGGER manifestos_updated_at
  BEFORE UPDATE ON manifestos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS manifesto_itens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifesto_id        UUID REFERENCES manifestos(id) ON DELETE CASCADE,
    ponto_de_entrega_id UUID REFERENCES pontos_de_entrega(id),
    sequencia           INTEGER NOT NULL,
    escola_nome         TEXT,
    escola_endereco     TEXT,
    escola_cie          TEXT,
    gr_numero           TEXT,
    gr_pdf_url          TEXT,
    produto_nome        TEXT,
    unidade_medida      TEXT NOT NULL CHECK (unidade_medida IN ('UNIDADE', 'CAIXA', 'PACOTE')),
    quantidade          DECIMAL NOT NULL,
    caixas_cheias       INTEGER,
    unidades_avulsas    INTEGER,
    valor_gr            DECIMAL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manifesto_itens_manifesto  ON manifesto_itens(manifesto_id);
CREATE INDEX IF NOT EXISTS idx_manifesto_itens_sequencia  ON manifesto_itens(manifesto_id, sequencia);

-- ─────────────────────────────────────────────────────────────
-- CAMADA 3 — ATIVOS (caixas plásticas)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ativos_logisticos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id       UUID REFERENCES clientes(id),
    tipo             TEXT NOT NULL,
    quantidade_total INTEGER NOT NULL DEFAULT 0,
    valor_unitario   DECIMAL,
    descricao        TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS termos_emprestimo (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ponto_de_entrega_id UUID REFERENCES pontos_de_entrega(id),
    cliente_id          UUID REFERENCES clientes(id),
    quantidade_acordada INTEGER NOT NULL,
    data_inicio         DATE NOT NULL,
    data_fim            DATE,
    status              TEXT NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'encerrado', 'pendente_devolucao')),
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CAMADA 4 — QUALIDADE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ocorrencias (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                TEXT NOT NULL CHECK (tipo IN (
                            'divergencia_retorno_caixas', 'avaria_produto',
                            'entrega_parcial', 'atraso', 'outro'
                        )),
    manifesto_id        UUID REFERENCES manifestos(id),
    agregado_id         UUID REFERENCES agregados(id),
    ponto_de_entrega_id UUID REFERENCES pontos_de_entrega(id),
    descricao           TEXT,
    detalhe             JSONB,
    status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'em_tratamento', 'resolvida', 'encerrada')),
    registrado_por      UUID REFERENCES usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CAMADA 5 — PÁTIO
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS romaneio_entrada (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id       UUID REFERENCES clientes(id),
    semana_ref       DATE NOT NULL,
    total_contratado INTEGER,
    total_realizado  INTEGER DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando', 'em_andamento', 'concluido', 'pendencia')),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS romaneio_saida (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id              UUID REFERENCES clientes(id),
    semana_ref              DATE NOT NULL,
    romaneio_entrada_ref_id UUID REFERENCES romaneio_entrada(id),
    total_devido            INTEGER,
    total_realizado         INTEGER DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'aguardando'
                            CHECK (status IN ('aguardando', 'em_andamento', 'concluido', 'pendencia')),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS romaneio_viagens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    romaneio_entrada_id UUID REFERENCES romaneio_entrada(id),
    romaneio_saida_id   UUID REFERENCES romaneio_saida(id),
    data_viagem         DATE NOT NULL,
    veiculo             TEXT,
    caixas_previstas    INTEGER,
    caixas_recebidas    INTEGER,
    caixas_devolvidas   INTEGER,
    confirmado_por      UUID REFERENCES usuarios(id),
    confirmado_em       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CAMADA 6 — FINANCEIRO
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faturas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id       UUID REFERENCES clientes(id),
    periodo_ref      DATE NOT NULL,
    modelo_cobranca  TEXT NOT NULL
                     CHECK (modelo_cobranca IN ('fixo_mensal', 'por_caixa', 'por_rota', 'misto')),
    valor_contratado DECIMAL,
    total_caixas     INTEGER,
    valor_por_caixa  DECIMAL,
    valor_total      DECIMAL NOT NULL,
    data_emissao     DATE NOT NULL,
    data_vencimento  DATE,
    status           TEXT NOT NULL DEFAULT 'rascunho'
                     CHECK (status IN ('rascunho', 'emitida', 'recebida', 'inadimplente')),
    observacoes      TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recebimentos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fatura_id        UUID REFERENCES faturas(id),
    referencia       TEXT,
    valor            DECIMAL NOT NULL,
    data_competencia DATE,
    data_recebimento DATE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'recebido'
                     CHECK (status IN ('a_receber', 'recebido', 'contestado')),
    observacoes      TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notas_fiscais (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agregado_id      UUID REFERENCES agregados(id),
    manifesto_id     UUID REFERENCES manifestos(id),
    arquivo_url      TEXT,
    nf_numero        TEXT,
    nf_valor         DECIMAL,
    nf_data_emissao  DATE,
    cnpj_emitente    TEXT,
    status           TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'conferida', 'aprovada', 'divergencia', 'paga')),
    divergencia_motivo TEXT,
    recebida_em      TIMESTAMPTZ DEFAULT NOW(),
    conferida_por    UUID REFERENCES usuarios(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria        TEXT NOT NULL,
    descricao        TEXT NOT NULL,
    valor            DECIMAL NOT NULL,
    data_vencimento  DATE NOT NULL,
    data_pagamento   DATE,
    status           TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'pago', 'cancelado')),
    comprovante_url  TEXT,
    criado_por       UUID REFERENCES usuarios(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotes_pagamento (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_lote        DATE NOT NULL,
    total_valor      DECIMAL NOT NULL DEFAULT 0,
    total_itens      INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'montando'
                     CHECK (status IN (
                         'montando', 'enviado_banco', 'aguardando_aprovacao',
                         'aprovado', 'processado', 'erro', 'cancelado'
                     )),
    banco_lote_id        TEXT,
    aprovado_por         UUID REFERENCES usuarios(id),
    aprovado_em          TIMESTAMPTZ,
    processado_em        TIMESTAMPTZ,
    arquivo_email_url    TEXT,
    email_enviado_em     TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pagamento (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id        UUID REFERENCES lotes_pagamento(id),
    nota_fiscal_id UUID REFERENCES notas_fiscais(id),
    agregado_id    UUID REFERENCES agregados(id),
    chave_pix      TEXT NOT NULL,
    valor          DECIMAL NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'processado', 'erro')),
    erro_descricao TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo              TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    origem            TEXT NOT NULL CHECK (origem IN ('recebimento', 'lote_pagamento', 'despesa', 'outro')),
    origem_id         UUID,
    valor             DECIMAL NOT NULL,
    data_movimentacao DATE NOT NULL,
    descricao         TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- RLS — todas as tabelas
-- Fase 2a: qualquer autenticado lê e escreve (simplificado para protótipo)
-- RLS por perfil entra na Fase 2c
-- ─────────────────────────────────────────────────────────────

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clientes','pontos_de_entrega','produtos','agregados',
    'rotas','rota_pontos','ordens_de_servico','manifestos','manifesto_itens',
    'ativos_logisticos','termos_emprestimo','ocorrencias',
    'romaneio_entrada','romaneio_saida','romaneio_viagens',
    'faturas','recebimentos','notas_fiscais','despesas',
    'lotes_pagamento','itens_pagamento','movimentacoes_caixa'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;
