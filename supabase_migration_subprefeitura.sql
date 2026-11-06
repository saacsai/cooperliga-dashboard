-- Subprefeitura por ponto de entrega — só existe na Guia de Remessa em PDF da
-- Prefeitura, não na planilha (coluna AGRUP é mais grosseira, mistura várias
-- subprefeituras num mesmo valor). Guardar persistido evita ter que re-subir
-- o PDF toda vez que for combinar produtos/cooperativas diferentes — basta
-- consultar os pontos já importados filtrando por subprefeitura.

ALTER TABLE pontos_de_entrega
  ADD COLUMN IF NOT EXISTS subprefeitura text;

CREATE INDEX IF NOT EXISTS idx_pontos_subprefeitura ON pontos_de_entrega(subprefeitura);
