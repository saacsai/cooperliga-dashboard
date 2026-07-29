# Fase 3 — Roteirização Inteligente

**Decisão:** 2026-07-29  
**Status:** Arquitetura definida, aguardando planilhas XLS para mapear schema de extração

---

## Contexto — Por que mudar o início do fluxo

### Problema atual
O fluxo atual exige que a rota exista ANTES do upload das GRs:
```
GR + folha de rosto → alinhamento manual → rota cadastrada → manifesto
```
Na prática, a Cooperliga não consegue definir "rotas principais" estáveis porque as rotas mudam a cada operação conforme as GRs recebidas. Isso travou a alimentação do sistema.

### Solução
Inverter o fluxo: as rotas nascem do alinhamento, não precisam existir antes:
```
XLS das GRs por região → staging → 3 perguntas → sugestão de rotas → ajuste humano → manifesto
```

---

## Fontes de dados confirmadas

| Origem | Formato | Chave de identificação |
|--------|---------|----------------------|
| Estado SP (SEE-SP) | XLS por Diretoria | codigo_estado (CEI) |
| Municipal (Prefeitura) | XLS por Solicitação | codigo_prefeitura (CODIGO_UNIDADE) |

**Importante:** ambas as fontes têm planilha XLS — sem necessidade de OCR ou leitura de PDF para extração de dados estruturados. Confiabilidade ~100%.

### Schema das planilhas (A MAPEAR)
Aguardando XLS de amostra de cada tipo para documentar colunas exatas.
- [ ] XLS Estado (Diretoria) — colunas a mapear
- [ ] XLS Municipal — colunas a mapear (CODIGO_UNIDADE e Nº_GUIA_REMESSA confirmados)

---

## Arquitetura técnica

### Novas tabelas no Supabase

```sql
-- Sessão de roteirização (uma por operação/ciclo por região)
CREATE TABLE roteirizacao_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid REFERENCES contratos(id),
  regiao text NOT NULL,           -- diretoria ou subprefeitura
  tipo_gr text NOT NULL,          -- 'estado' | 'municipal'
  num_produtos int NOT NULL,      -- parâmetro 1: multiplicador de tempo
  carga_dobrada boolean DEFAULT false, -- parâmetro 2: volume × 2
  max_entregas int NOT NULL,      -- parâmetro 3: teto empírico por motorista
  status text DEFAULT 'rascunho', -- 'rascunho' | 'confirmado'
  data_ciclo text,                -- ex: '0506'
  created_by uuid REFERENCES usuarios(id),
  created_at timestamptz DEFAULT now()
);

-- Rotas sugeridas pelo sistema dentro de uma sessão
CREATE TABLE roteirizacao_rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid REFERENCES roteirizacao_sessoes(id) ON DELETE CASCADE,
  ordem int NOT NULL,
  veiculo_tipo text,              -- 'iveco' | 'hr' | 'fiorino' (sugerido, ajustável)
  agregado_id uuid REFERENCES agregados(id),
  created_at timestamptz DEFAULT now()
);

-- Pontos de entrega atribuídos a cada rota sugerida
CREATE TABLE roteirizacao_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES roteirizacao_rotas(id) ON DELETE CASCADE,
  ponto_id uuid REFERENCES pontos_de_entrega(id),
  ordem int NOT NULL,             -- sequência dentro da rota
  qtde_caixas int,                -- total de caixas nesse ponto nessa operação
  gr_numeros text[],              -- GRs que geraram esse ponto
  created_at timestamptz DEFAULT now()
);

-- Geocoordenadas em pontos_de_entrega (migration separada)
ALTER TABLE pontos_de_entrega ADD COLUMN IF NOT EXISTS lat float;
ALTER TABLE pontos_de_entrega ADD COLUMN IF NOT EXISTS lng float;
ALTER TABLE pontos_de_entrega ADD COLUMN IF NOT EXISTS geo_status text
  DEFAULT 'pendente'; -- 'pendente' | 'ok' | 'sem_endereco' | 'nao_encontrado'
```

### Algoritmo de sugestão (worker FastAPI — nova rota /roteirizar)

```python
# Entrada
{
  "pontos": [{"ponto_id": "...", "lat": -23.5, "lng": -46.6, "qtde_caixas": 2}],
  "num_produtos": 2,
  "carga_dobrada": false,
  "max_entregas": 25
}

# Lógica
fator_tempo = 1.0 + (num_produtos - 1) * 0.25
entregas_efetivas = floor(max_entregas / fator_tempo)
volume_por_ponto  = qtde_caixas * (2 if carga_dobrada else 1)
N_rotas = ceil(total_pontos / entregas_efetivas)

# K-means geográfico sobre lat/lng → N clusters
# Para cada cluster: soma volume → define veículo
#   ≤ 50 cx → Fiorino | ≤ 100 cx → HR | > 100 cx → Iveco

# Saída
{
  "rotas": [
    {
      "ordem": 1,
      "veiculo_sugerido": "hr",
      "total_entregas": 23,
      "total_caixas": 48,
      "pontos": [{"ponto_id": "...", "nome": "CEI ...", "ordem": 1}]
    }
  ]
}
```

### Matching XLS → pontos_de_entrega

```
XLS traz codigo_cei
  ↓
  Busca pontos_de_entrega WHERE codigo_estado = codigo_cei
  ↓
  Encontrou → usa ponto existente + atualiza qtde desta operação
  Não encontrou → INSERT novo ponto com nome + endereço + município da planilha
                  (resolve enriquecimento da base automaticamente)
```

---

## UI — Novo fluxo no dashboard

### Tela: /dashboard/roteirizacao (substitui /dashboard/guias para o fluxo novo)

**Passo 1 — Upload dos XLS**
- Aba Estado: XLS por Diretoria (múltiplos)
- Aba Municipal: XLS de GRs + XLS de rota
- Extração roda no worker → retorna pontos + quantidades → salva em staging

**Passo 2 — Setup (3 perguntas)**
```
Quantos produtos nessa operação?     [2]
Carga dobrada?                  ○ Sim ● Não
Máx. entregas por motorista?        [25]
                           [Gerar sugestão]
```

**Passo 3 — Ajuste das rotas sugeridas**
- Cards lado a lado, um por rota sugerida
- Drag-and-drop de escolas entre rotas
- Troca de veículo por rota
- Botão "+ Nova rota" para dividir manualmente
- Ao confirmar → gera manifestos automaticamente (um por rota)

---

## Geocodificação dos pontos existentes

- **677 pontos com endereço:** geocodificar via Nominatim (gratuito) em batch
- **677 pontos sem endereço:** enriquecer via upload de XLS (cada GR traz endereço)
- **Tela no dashboard:** /dashboard/pontos-de-entrega com status geo + botão "Geocodificar pendentes"

---

## Aprendizado ao longo do tempo

Quando uma sessão é confirmada:
- Os agrupamentos ficam salvos como referência histórica por região
- Na próxima operação da mesma região, o sistema parte do último agrupamento confirmado
- Só precisa tratar pontos novos e removidos
- Com o PWA registrando hora de chegada/saída por ponto futuramente → calibrar fator_tempo real por CEI

---

## O que NÃO muda

| Componente | Status |
|-----------|--------|
| Upload de GRs atual (/dashboard/guias) | Mantido para retrocompatibilidade |
| Worker FastAPI na VPS | Mantido, ganha nova rota /roteirizar e /extrair-xls |
| Tabela pontos_de_entrega | Mantida, ganha lat/lng/geo_status |
| Geração de manifestos | Não muda — é acionada pelo confirm da sessão |
| PWA do motorista | Não muda |

---

## Pendências antes de implementar

- [ ] Receber XLS de amostra do Estado (por Diretoria) → mapear colunas
- [ ] Receber XLS de amostra do Municipal → confirmar colunas
- [ ] Decidir: Nominatim (gratuito) ou Google Maps API (pago, mais preciso) para geocodificação
- [ ] Confirmar capacidade em caixas por tipo de veículo com a Cooperliga
  - Iveco: ~100 cx?
  - HR: ~50 cx?
  - Fiorino: ~25 cx?
