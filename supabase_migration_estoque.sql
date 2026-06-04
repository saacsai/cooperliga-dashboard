-- Estoque de caixas: conta corrente por cliente/agregado
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  data         DATE        NOT NULL DEFAULT CURRENT_DATE,
  tipo         TEXT        NOT NULL,
  cliente_id   UUID        REFERENCES clientes(id)         ON DELETE SET NULL,
  agregado_id  UUID        REFERENCES agregados(id)        ON DELETE SET NULL,
  produto_id   UUID        REFERENCES produtos(id)         ON DELETE SET NULL,
  manifesto_id UUID        REFERENCES ciclo_manifestos(id) ON DELETE SET NULL,
  entrada      INTEGER     NOT NULL DEFAULT 0 CHECK (entrada >= 0),
  saida        INTEGER     NOT NULL DEFAULT 0 CHECK (saida   >= 0),
  observacao   TEXT,
  created_by   UUID        REFERENCES usuarios(id)         ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tipo_valido CHECK (
    tipo IN ('recebimento','distribuicao','retorno','retirada','venda','ajuste')
  )
);

CREATE INDEX IF NOT EXISTS idx_estoque_cliente  ON estoque_movimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_estoque_agregado ON estoque_movimentos(agregado_id);
CREATE INDEX IF NOT EXISTS idx_estoque_data     ON estoque_movimentos(data, created_at);
