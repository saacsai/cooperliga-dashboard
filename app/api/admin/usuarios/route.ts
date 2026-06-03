import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'
import { enviarBoasVindas } from '@/lib/email'
import type { Perfil } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: { user } } = await getSupabase().auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: caller } = await admin.from('usuarios').select('perfil').eq('id', user.id).single()
  if (caller?.perfil !== 'admin') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { nome, email, whatsapp, perfil } = await req.json()
  if (!nome || !email || !perfil) {
    return NextResponse.json({ error: 'Campos obrigatórios: nome, email, perfil' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cooperliga.saacs.com.br'

  // Senha aleatória — nunca enviada, o usuário vai definir a própria via link
  const senhaTemp = crypto.randomUUID()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senhaTemp,
    email_confirm: true,
  })
  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 })

  const { error: insertErr } = await admin.from('usuarios').insert({
    id: created.user.id,
    nome,
    email,
    whatsapp: whatsapp || null,
    perfil: perfil as Perfil,
    ativo: true,
  })
  if (insertErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Gera link de definição de senha e envia email de boas-vindas
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  })

  const emailResult = await enviarBoasVindas({
    nome,
    email,
    link: linkData?.properties?.action_link || `${appUrl}/login`,
  })
  console.log('[criar-usuario] resend result:', JSON.stringify(emailResult))

  return NextResponse.json({ id: created.user.id })
}
