# N8N — Fluxo: Recebimento de NF via WhatsApp

## Objetivo
Quando um agregado envia NF no WhatsApp (quarta-feira), a IA extrai o número e valor,
valida no sistema e atualiza o status do pagamento automaticamente.

## Variáveis de ambiente N8N
- `COOPERLIGA_URL` = `https://cooperliga.saacs.com.br`
- `WEBHOOK_SECRET` = mesmo valor do `.env` do dashboard
- `GESTOR_WHATSAPP` = número do gestor (para alertas de divergência)

---

## Nós do fluxo

### 1. Trigger — WhatsApp Message Received (Evolution API)
- Event: `messages.upsert`
- Filter: `message.key.fromMe == false`

### 2. Code — Extrair remetente
```javascript
const msg = $input.first().json
const numero = msg.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') || ''
const texto  = msg.data?.message?.conversation
             || msg.data?.message?.extendedTextMessage?.text
             || ''
const temImagem = !!msg.data?.message?.imageMessage

return [{ json: { numero, texto, temImagem, msgCompleto: msg } }]
```

### 3. HTTP Request — Consultar pagamentos pendentes
- Method: `GET`
- URL: `{{ $env.COOPERLIGA_URL }}/api/pagamentos/pendente?whatsapp={{ $json.numero }}`
- Headers: `x-webhook-secret: {{ $env.WEBHOOK_SECRET }}`

### 4. IF — Agregado encontrado e tem pendência?
- Condition: `{{ $json.encontrado == true && $json.pagamentos_pendentes.length > 0 }}`
- Se NÃO → nó 5 (responder "não encontrado")
- Se SIM → nó 6 (IA)

### 5. WhatsApp Send — Resposta "não encontrado"
- Para: `{{ $('Code').item.json.numero }}`
- Mensagem: `{{ $json.mensagem_whatsapp }}`
- → **STOP**

### 6. AI Agent — Gemini: Extrair NF da mensagem
- Model: `gemini-2.0-flash`
- System prompt:
```
Você é um assistente que extrai dados de notas fiscais de mensagens de WhatsApp de motoristas.
Analise a mensagem e extraia:
1. nf_numero: número da nota fiscal (apenas dígitos)
2. valor_nf: valor total em reais (número decimal, ex: 330.00)

Retorne SOMENTE um JSON válido:
{"nf_numero": "1234", "valor_nf": 330.00}

Se não encontrar um campo, use null.
Se a mensagem mencionar múltiplas NFs, use a de maior valor.
```
- User message: `{{ $('Code').item.json.texto }}`

> **Se tiver imagem:** usar endpoint de visão do Gemini com a URL da mídia antes deste nó.

### 7. Code — Parsear resposta da IA
```javascript
const resposta = $input.first().json.text || $input.first().json.output || ''
let dados = { nf_numero: null, valor_nf: null }
try {
  const match = resposta.match(/\{[\s\S]*\}/)
  if (match) dados = JSON.parse(match[0])
} catch(e) {}

if (!dados.nf_numero) {
  return [{ json: { erro: true, mensagem: 'Não consegui identificar o número da NF. Envie no formato: NF 1234 ou apenas o número.' } }]
}

return [{ json: { ...dados, erro: false } }]
```

### 8. IF — IA conseguiu extrair NF?
- Condition: `{{ $json.erro == false }}`
- Se NÃO → WhatsApp pede reenvio com instruções
- Se SIM → nó 9

### 9. HTTP Request — Registrar NF no sistema
- Method: `POST`
- URL: `{{ $env.COOPERLIGA_URL }}/api/pagamentos/receber-nf`
- Headers: `x-webhook-secret: {{ $env.WEBHOOK_SECRET }}`
- Body (JSON):
```json
{
  "whatsapp": "{{ $('Code').item.json.numero }}",
  "nf_numero": "{{ $json.nf_numero }}",
  "valor_nf": {{ $json.valor_nf }}
}
```

### 10. WhatsApp Send — Confirmação para o agregado
- Para: `{{ $('Code').item.json.numero }}`
- Mensagem: `{{ $json.mensagem_whatsapp }}`

### 11. IF — Tem divergência?
- Condition: `{{ $json.divergencia == true }}`
- Se SIM → nó 12

### 12. WhatsApp Send — Alerta para o gestor
- Para: `{{ $env.GESTOR_WHATSAPP }}`
- Mensagem: `{{ $json.mensagem_gestor }}`

---

## Resultado no dashboard

Após o fluxo, o pagamento aparece em `/dashboard/financeiro` com:
- Status: `NF Recebida` (verde-azul)
- NF: número informado
- Se divergência: campo `observação` com `⚠️ DIVERGÊNCIA: NF R$300 vs esperado R$330`
- Gestor vê divergências em destaque e pode aprovar ou rejeitar manualmente
