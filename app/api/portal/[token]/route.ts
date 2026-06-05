import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

function normalizarWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '')
  return digits.length >= 12 ? digits : `55${digits}`
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendWhatsApp(numero: string, texto: string): Promise<void> {
  const url = `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`
  await fetch(url, {
    method: 'POST',
    headers: { apikey: process.env.EVOLUTION_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: normalizarWhatsapp(numero), text: texto }),
  })
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const sb = getSupabaseAdmin()

  const { data: agregado } = await sb
    .from('agregados')
    .select('id, nome, whatsapp, ativo')
    .eq('access_token', params.token)
    .single()

  if (!agregado || !agregado.ativo) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }

  // Verifica sessão ativa no cookie
  const cookieStore = cookies()
  const sessionToken = cookieStore.get('coop_portal_session')?.value

  if (sessionToken) {
    const { data: session } = await sb
      .from('portal_sessions')
      .select('id')
      .eq('session_token', sessionToken)
      .eq('agregado_id', agregado.id)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (session) {
      const { data: pagamentos } = await sb
        .from('pagamentos_agregados')
        .select(`
          id, semana_ref, data_vencimento, valor_total,
          status, nf_numero, nf_arquivo,
          pagamentos_itens(
            id, valor,
            ciclo_manifestos(numero_base, letra, data_entrega),
            rotas(nome)
          )
        `)
        .eq('agregado_id', agregado.id)
        .order('data_vencimento', { ascending: false })
        .limit(12)

      return NextResponse.json({ ok: true, nome: agregado.nome, pagamentos: pagamentos || [] })
    }
  }

  // Sem sessão válida — rate limit: máx 3 OTPs por hora
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await sb
    .from('portal_otps')
    .select('*', { count: 'exact', head: true })
    .eq('agregado_id', agregado.id)
    .gt('created_at', umaHoraAtras)

  if ((count || 0) >= 3) {
    return NextResponse.json({
      ok: false,
      needsOtp: true,
      nome: agregado.nome,
      error: 'rate_limit',
      message: 'Muitas tentativas. Aguarde alguns minutos.',
    })
  }

  if (!agregado.whatsapp) {
    return NextResponse.json({ error: 'WhatsApp não cadastrado. Entre em contato com o gestor.' }, { status: 400 })
  }

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await sb.from('portal_otps').insert({ agregado_id: agregado.id, code, expires_at: expiresAt })

  await sendWhatsApp(
    agregado.whatsapp,
    `CooperLiga — Seu código de acesso é: *${code}*\n\nVálido por 10 minutos. Não compartilhe este código.`
  )

  return NextResponse.json({ ok: false, needsOtp: true, nome: agregado.nome })
}
