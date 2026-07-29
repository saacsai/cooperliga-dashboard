# Decisão: PWA substitui fluxo WhatsApp/N8N para NF de agregados

**Data:** 2026-07-29  
**Status:** Decisão tomada — fluxo N8N não será implementado

---

## Contexto

O fluxo WhatsApp/N8N (Fase 2g) foi projetado quando o agregado não tinha acesso direto ao sistema.
A lógica era: agregado envia NF no zap → IA extrai número e valor → valida no sistema → atualiza status.

## Por que o PWA torna isso desnecessário

O agregado já usa o PWA (`/mobile/estoque`) para registrar distribuição e retorno.
O mesmo PWA pode:
- Mostrar pagamentos pendentes com valor e prazo
- Receber upload de NF direto (PDF ou foto)
- Atualizar status automaticamente sem intermediário

## O que foi cancelado / não precisa ser configurado

| Item | Status |
|------|--------|
| Instância `cooperliga-nf` no Evolution API | ❌ Não criar |
| Fluxo N8N 12 nós (docs/n8n_fluxo_nf_agregados.md) | ❌ Não implementar |
| `EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY` | ❌ Não adicionar no Vercel |
| `WEBHOOK_SECRET` para N8N | ❌ Não necessário |
| Chip WhatsApp dedicado `cooperliga-nf` | ❌ Não comprar |

As APIs `/api/pagamentos/pendente` e `/api/pagamentos/receber-nf` ficam no código
mas não precisam ser ativadas — o PWA as substituirá com upload direto.

## O que implementar no PWA (fase futura)

Dentro do hub `/mobile/estoque`, nova seção "Financeiro":
- Card mostrando pagamentos pendentes com valor
- Botão "Enviar NF" → upload de arquivo → Storage → status `nf_recebida`
- Mesma lógica do Portal OTP atual, mas integrada ao PWA autenticado

O Portal OTP (`/portal/[token]`) pode ser mantido para agregados que não usam o PWA.
