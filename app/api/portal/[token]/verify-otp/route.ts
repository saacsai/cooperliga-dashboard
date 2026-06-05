import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const sb = getSupabaseAdmin()

  const { data: agregado } = await sb
    .from('agregados')
    .select('id, nome')
    .eq('access_token', params.token)
    .single()

  if (!agregado) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }

  const { code } = await req.json()
  if (!code) {
    return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })
  }

  const { data: otp } = await sb
    .from('portal_otps')
    .select('id')
    .eq('agregado_id', agregado.id)
    .eq('code', String(code).trim())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otp) {
    return NextResponse.json({ error: 'Código inválido ou expirado.' }, { status: 401 })
  }

  await sb.from('portal_otps').update({ used_at: new Date().toISOString() }).eq('id', otp.id)

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: session } = await sb
    .from('portal_sessions')
    .insert({ agregado_id: agregado.id, expires_at: expiresAt })
    .select('session_token')
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Erro interno ao criar sessão' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('coop_portal_session', session.session_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   30 * 24 * 60 * 60,
    path:     '/',
  })
  return res
}
