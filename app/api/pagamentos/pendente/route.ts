import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/pagamentos/pendente?whatsapp=5511999999999
// Chamado pelo N8N ao receber mensagem de WhatsApp de um agregado.
// Retorna os pagamentos pendentes de NF e uma mensagem pronta para enviar.

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

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const whatsapp = req.nextUrl.searchParams.get('whatsapp')
  if (!whatsapp) {
    return NextResponse.json({ error: 'Parâmetro whatsapp obrigatório' }, { status: 400 })
  }

  const numero = normalizarWhatsapp(whatsapp)
  const sb = getSupabaseAdmin()

  // Busca agregado pelo número normalizado (sem formatação)
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
      encontrado: false,
      mensagem_whatsapp: 'Seu número não está cadastrado no sistema CooperLiga. Entre em contato com o gestor.',
    })
  }

  // Busca pagamentos aguardando NF
  const { data: pagamentos } = await sb
    .from('pagamentos_agregados')
    .select(`
      id, semana_ref, data_vencimento, valor_total, status, nf_numero,
      pagamentos_itens(
        manifesto_id,
        ciclo_manifestos(numero_base, letra)
      )
    `)
    .eq('agregado_id', agregado.id)
    .eq('status', 'aguardando_nf')
    .order('data_vencimento', { ascending: true })

  if (!pagamentos?.length) {
    return NextResponse.json({
      encontrado: true,
      agregado: { id: agregado.id, nome: agregado.nome },
      pagamentos_pendentes: [],
      mensagem_whatsapp: `Olá, ${agregado.nome}! Não encontrei nenhum pagamento aguardando NF no momento. Se achar que há um erro, fale com o gestor.`,
    })
  }

  const pendentesFormatados = pagamentos.map(p => {
    const itens = (p.pagamentos_itens || []) as any[]
    const manifestos = itens
      .map(i => i.ciclo_manifestos)
      .filter(Boolean)
      .map((m: any) => `#${String(m.numero_base).padStart(4, '0')}${m.letra}`)

    return {
      id: p.id,
      semana_ref: p.semana_ref,
      data_vencimento: p.data_vencimento,
      valor_total: Number(p.valor_total),
      manifestos,
    }
  })

  // Mensagem para o agregado
  const totalGeral = pendentesFormatados.reduce((a, p) => a + p.valor_total, 0)
  const linhas = pendentesFormatados.map(p =>
    `• Semana ${fmtData(p.semana_ref)} — ${fmtMoeda(p.valor_total)} (vence ${fmtData(p.data_vencimento)})\n  Manifestos: ${p.manifestos.join(', ')}`
  )

  const mensagem = [
    `Olá, ${agregado.nome}! 👋`,
    ``,
    `Encontrei ${pendentesFormatados.length} pagamento(s) aguardando NF:`,
    ``,
    ...linhas,
    ``,
    `*Total: ${fmtMoeda(totalGeral)}*`,
    ``,
    `Envie a(s) NF(s) referenciando os manifestos acima para confirmar o pagamento.`,
  ].join('\n')

  return NextResponse.json({
    encontrado: true,
    agregado: { id: agregado.id, nome: agregado.nome },
    pagamentos_pendentes: pendentesFormatados,
    mensagem_whatsapp: mensagem,
  })
}
