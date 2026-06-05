import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/pagamentos/receber-nf
// Chamado pelo N8N após a IA extrair o número e valor da NF do WhatsApp.
//
// Body: {
//   whatsapp: "5511999999999",  // remetente da mensagem
//   nf_numero: "1234",           // extraído pela IA
//   valor_nf?: 330.00,           // extraído da imagem (opcional — para detectar divergência)
//   pagamento_id?: "uuid"        // opcional — força um pagamento específico
// }

const TOLERANCIA_DIVERGENCIA = 0.05  // 5% de diferença aceita sem divergência

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

function normalizarWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '')
  return digits.length >= 12 ? digits : `55${digits}`
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { whatsapp, nf_numero, valor_nf, pagamento_id } = body

  if (!whatsapp || !nf_numero) {
    return NextResponse.json({ error: 'whatsapp e nf_numero são obrigatórios' }, { status: 400 })
  }

  const numero = normalizarWhatsapp(whatsapp)
  const sb = getSupabaseAdmin()

  // Identifica o agregado
  const { data: agregados } = await sb
    .from('agregados')
    .select('id, nome, whatsapp')
    .eq('ativo', true)

  const agregado = (agregados || []).find(a => {
    if (!a.whatsapp) return false
    return normalizarWhatsapp(a.whatsapp) === numero
  })

  if (!agregado) {
    return NextResponse.json({
      ok: false,
      erro: 'nao_encontrado',
      mensagem_whatsapp: 'Número não cadastrado. Entre em contato com o gestor.',
    })
  }

  // Encontra o pagamento
  let pagamento: any = null

  if (pagamento_id) {
    // Pagamento específico informado pelo N8N
    const { data } = await sb
      .from('pagamentos_agregados')
      .select(`id, semana_ref, data_vencimento, valor_total, status, pagamentos_itens(ciclo_manifestos(numero_base, letra))`)
      .eq('id', pagamento_id)
      .eq('agregado_id', agregado.id)
      .single()
    pagamento = data
  } else {
    // Pega o mais antigo aguardando NF
    const { data } = await sb
      .from('pagamentos_agregados')
      .select(`id, semana_ref, data_vencimento, valor_total, status, pagamentos_itens(ciclo_manifestos(numero_base, letra))`)
      .eq('agregado_id', agregado.id)
      .eq('status', 'aguardando_nf')
      .order('data_vencimento', { ascending: true })
      .limit(1)
      .single()
    pagamento = data
  }

  if (!pagamento) {
    return NextResponse.json({
      ok: false,
      erro: 'sem_pendencia',
      mensagem_whatsapp: `${agregado.nome}, não encontrei pagamento pendente de NF. Se achar que há um erro, fale com o gestor.`,
    })
  }

  // Verifica divergência de valor
  const valorEsperado = Number(pagamento.valor_total)
  let divergencia = false
  let divergenciaDetalhe = ''

  if (valor_nf != null) {
    const valorNF = Number(valor_nf)
    const diferenca = Math.abs(valorNF - valorEsperado) / valorEsperado
    if (diferenca > TOLERANCIA_DIVERGENCIA) {
      divergencia = true
      divergenciaDetalhe = `NF ${fmtMoeda(valorNF)} vs esperado ${fmtMoeda(valorEsperado)}`
    }
  }

  // Formata manifestos para exibição
  const itens = (pagamento.pagamentos_itens || []) as any[]
  const manifestos = itens
    .map((i: any) => i.ciclo_manifestos)
    .filter(Boolean)
    .map((m: any) => `#${String(m.numero_base).padStart(4, '0')}${m.letra}`)

  // Atualiza no banco
  const observacaoExtra = divergencia ? `⚠️ DIVERGÊNCIA: ${divergenciaDetalhe}` : null

  await sb.from('pagamentos_agregados').update({
    nf_numero:   String(nf_numero).trim(),
    status:      'nf_recebida',
    observacao:  observacaoExtra,
    updated_at:  new Date().toISOString(),
  }).eq('id', pagamento.id)

  // Mensagens para retornar ao N8N
  const mensagemAgregado = divergencia
    ? [
        `⚠️ NF ${nf_numero} recebida, mas identificamos uma divergência de valor.`,
        `Esperado: ${fmtMoeda(valorEsperado)} | NF: ${fmtMoeda(Number(valor_nf))}`,
        `Seu pagamento ficará em análise. O gestor entrará em contato.`,
      ].join('\n')
    : [
        `✅ NF ${nf_numero} recebida com sucesso!`,
        ``,
        `Pagamento confirmado:`,
        `• Valor: ${fmtMoeda(valorEsperado)}`,
        `• Vencimento: ${fmtData(pagamento.data_vencimento)}`,
        `• Manifestos: ${manifestos.join(', ')}`,
        ``,
        `O pagamento será processado na data de vencimento. 👍`,
      ].join('\n')

  const mensagemGestor = divergencia
    ? `⚠️ Divergência NF — ${agregado.nome}: NF ${nf_numero} — ${divergenciaDetalhe}. Verificar em /dashboard/financeiro.`
    : null

  return NextResponse.json({
    ok: true,
    divergencia,
    divergencia_detalhe: divergenciaDetalhe || null,
    pagamento: {
      id:              pagamento.id,
      agregado:        agregado.nome,
      nf_numero:       String(nf_numero).trim(),
      valor_total:     valorEsperado,
      data_vencimento: pagamento.data_vencimento,
      manifestos,
    },
    mensagem_whatsapp: mensagemAgregado,
    mensagem_gestor:   mensagemGestor,
  })
}
