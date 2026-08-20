-- Fase 2: "Rota" deixa de ser pré-requisito do manifesto — agregado
-- (motorista/veículo) passa a ser atribuído direto no manifesto, no
-- momento do carregamento, com valor padrão herdado do próprio cadastro
-- do agregado (editável por exceção).
-- Rodar no Supabase SQL Editor (idempotente).

ALTER TABLE agregados
  ADD COLUMN IF NOT EXISTS valor_frete_padrao numeric(10,2);

ALTER TABLE ciclo_manifestos
  ADD COLUMN IF NOT EXISTS agregado_id uuid REFERENCES agregados(id),
  ADD COLUMN IF NOT EXISTS valor_frete numeric(10,2),
  ADD COLUMN IF NOT EXISTS regiao text;

-- rota_id deixa de ser obrigatório — manifesto nasce sem rota nenhuma.
ALTER TABLE ciclo_manifestos
  ALTER COLUMN rota_id DROP NOT NULL;

-- Guarda o número da guia de remessa (GR) por ponto×produto, extraído
-- direto da planilha da Prefeitura durante a roteirização — permite o
-- worker casar a página certa do PDF de GR sem precisar re-subir a
-- planilha na hora de alinhar/imprimir.
ALTER TABLE ciclo_entregas
  ADD COLUMN IF NOT EXISTS gr_numero text;

-- "Região" passa a viver direto no ponto de entrega (preenchida a cada
-- roteirização) — substitui o agrupamento antigo via rotas/rota_pontos,
-- que o filtro por região em Pontos de Entrega usava. Backfill a partir
-- do que já existir em rotas antes de derrubar essas tabelas.
ALTER TABLE pontos_de_entrega
  ADD COLUMN IF NOT EXISTS regiao text;

UPDATE pontos_de_entrega pde SET regiao = sub.regiao
FROM (
  SELECT DISTINCT ON (rp.ponto_de_entrega_id) rp.ponto_de_entrega_id, r.regiao
  FROM rota_pontos rp
  JOIN rotas r ON r.id = rp.rota_id
  WHERE r.regiao IS NOT NULL AND r.regiao <> ''
) sub
WHERE pde.id = sub.ponto_de_entrega_id AND pde.regiao IS NULL;

-- Rodar só depois de confirmar (dashboard e worker deployados, sem mais
-- nenhuma leitura de `rotas`/`rota_pontos` em produção):
-- DROP TABLE rota_pontos;
-- DROP TABLE rotas;
