-- Aproveitamento de roteirização histórica por (região, nº de produtos)
-- Rodar no Supabase SQL Editor (idempotente).
--
-- Guarda quantos produtos entraram na roteirização que gerou cada manifesto
-- — é a chave (junto com `regiao`, que já existe) usada pra decidir se um
-- ciclo novo pode reaproveitar o agrupamento/ordem de um ciclo anterior, ou
-- se precisa recalcular do zero (nº de rotas mudou porque o nº de produtos
-- mudou, o que altera o fator_tempo/capacidade efetiva no worker).

ALTER TABLE ciclo_manifestos
  ADD COLUMN IF NOT EXISTS num_produtos int;
