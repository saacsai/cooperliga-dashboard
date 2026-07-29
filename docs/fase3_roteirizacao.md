# Fase 3 — Roteirização Inteligente

**Implementado:** 2026-07-29  
**Status:** ✅ Em produção

---

## Por que mudar o início do fluxo

O fluxo antigo exigia que a rota existisse ANTES das GRs:
```
GR + folha de rosto → alinhamento manual → rota cadastrada → manifesto
```
Na prática a Cooperliga não consegue definir "rotas principais" estáveis — elas mudam a cada operação. Isso travava a alimentação do sistema.

**Solução:** inverter o fluxo. As rotas nascem das GRs:
```
Upload das GRs → extração automática → 3 parâmetros → sugestão k-means → ajuste humano → sessão confirmada
```

---

## Fontes de dados

| Origem | Formato de upload | Chave de match |
|--------|------------------|----------------|
| Estado SP (SEE-SP) | ZIP com PDFs das GRs por Diretoria | `codigo_estado` = CIE extraído do PDF |
| Prefeitura SP | XLSX de solicitação | `codigo_prefeitura` = CODIGO DA UNIDADE |

**Estado:** o CIE (código único da escola) só aparece no PDF, não no CSV exportado. O worker extrai via regex do texto do PDF.

**Prefeitura:** o XLSX já traz endereço completo para 100% das unidades — geocodificação pode acontecer imediatamente.

---

## Endpoints do worker (FastAPI — guias.cooperliga.saacs.com.br)

### `POST /extrair-prefeitura`
Recebe: XLSX de solicitação da Prefeitura  
Retorna:
```json
{
  "numero_solicitacao": "34061",
  "data_entrega": "25/03/2026",
  "cooperativa": "AAGFAM",
  "alimento": "BANANA NANICA UN",
  "total_pontos": 297,
  "pontos": [
    {
      "codigo_prefeitura": "7842",
      "nome": "CEI PARC. VICENTE MATHEUS",
      "endereco": "R. CTE. CARLOS RUHL Nº 177",
      "gr_numero": 79124,
      "qtde_inteira": 1,
      "qtde_fracionada": 5
    }
  ]
}
```

### `POST /extrair-estado`
Recebe: ZIP com PDFs das GRs do Estado  
Retorna:
```json
{
  "total_pontos": 45,
  "avisos": [],
  "pontos": [
    {
      "gr_numero": "4324946",
      "cie": "438054",
      "diretoria": "SUL 2",
      "nome_escola": "AGENOR DE MIRANDA ARAUJO NETO - CAZUZA",
      "municipio": "SAO PAULO",
      "endereco": "ARNALDO DANIEL Nº:S/N RUA JARDIM GUARUJA",
      "cep": "05877150",
      "produto": "TANGERINA PONKAN AF",
      "unidade": "UNIDADE",
      "quantidade": 1000.0
    }
  ]
}
```

### `POST /roteirizar`
Recebe:
```json
{
  "pontos": [{"ponto_id": "uuid", "lat": -23.5, "lng": -46.6, "qtde_caixas": 2, "nome": "CEI..."}],
  "num_produtos": 2,
  "carga_dobrada": false,
  "max_entregas": 25
}
```
Retorna rotas sugeridas com veículo por volume:
- Fiorino: ≤ 25 cx
- HR: ≤ 50 cx  
- Iveco: > 50 cx

**Algoritmo:**
```
fator_tempo = 1.0 + (num_produtos - 1) × 0.25
entregas_efetivas = floor(max_entregas / fator_tempo)
N_rotas = ceil(total_pontos / entregas_efetivas)
k-means++ geográfico sobre lat/lng → N clusters
```

---

## Dashboard — `/dashboard/roteirizacao`

Fluxo em 4 fases:

**Fase 1 — Upload**
- Aba Prefeitura: XLSX de solicitação → `/extrair-prefeitura`
- Aba Estado: ZIP de PDFs → `/extrair-estado`

**Fase 2 — Conferência dos pontos**
- Lista pontos extraídos com status: 🟢 com geo / 🟡 sem geo / 🔵 novo (não cadastrado)
- Botão **Geocodificar** — chama `/api/geocodificar` (Nominatim, 1 req/s)
- Pontos novos ficam marcados mas não bloqueiam o fluxo

**Fase 3 — Parâmetros**
- Região / Diretoria (auto-detectada da extração quando única)
- Ciclo (DDMM)
- Quantos produtos? → calcula fator_tempo
- Máx. entregas/motorista → calcula entregas efetivas
- Carga dobrada?

**Fase 4 — Rotas sugeridas**
- Cards por rota: veículo, total entregas, total caixas, lista de pontos
- Seleção de veículo editável por rota
- Confirmar → salva `roteirizacao_sessoes` + `roteirizacao_rotas` + `roteirizacao_pontos`

---

## Geocodificação

**API route:** `POST /api/geocodificar`  
Recebe: `{ "ids": ["uuid1", "uuid2"] }`  
Para cada ponto:
1. Busca endereço + município em `pontos_de_entrega`
2. Chama Nominatim: `endereço, município, SP, Brasil`
3. Aguarda 1100ms (respeito ao rate limit do Nominatim)
4. Atualiza `lat`, `lng`, `geo_status`

**geo_status:** `'pendente'` | `'ok'` | `'sem_endereco'` | `'nao_encontrado'`

**Estimativa de tempo:** ~1 seg/ponto → 297 pontos da Prefeitura ≈ 5 minutos.

---

## Tabelas no Supabase

```sql
-- Adicionado em pontos_de_entrega:
lat        float
lng        float
geo_status text DEFAULT 'pendente'

-- Novas tabelas:
roteirizacao_sessoes   -- uma por operação/região (status: 'rascunho' | 'confirmado')
roteirizacao_rotas     -- rotas dentro da sessão
roteirizacao_pontos    -- escolas por rota com qtde e GRs de origem
```

Migration: `supabase_migration_roteirizacao.sql`

---

## Aprendizado ao longo do tempo

Sessões confirmadas ficam salvas como referência histórica por região.  
Na próxima operação da mesma região, o sistema pode partir do último agrupamento confirmado — só trata pontos novos e removidos.

---

## Próximos passos (fase futura)

- [ ] Drag-and-drop de pontos entre rotas no card de ajuste
- [ ] Geocodificar batch dos pontos já cadastrados (677 com endereço)
- [ ] Geração de manifesto direto ao confirmar a sessão (integração com tabela `ciclo_manifestos`)
- [ ] Calibração do fator_tempo real por CEI (hora de chegada/saída via PWA)
