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

  const { nome, email, whatsapp, perfil, senha } = await req.json()
  if (!nome || !email || !perfil || !senha) {
    return NextResponse.json({ error: 'Campos obrigatórios: nome, email, perfil, senha' }, { status: 400 })
  }

  // Cria usuário no Supabase Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 })

  // Insere na tabela usuarios
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

  // Envia email de boas-vindas
  const emailResult = await enviarBoasVindas({ nome, email, senha })
  console.log('[criar-usuario] resend result:', JSON.stringify(emailResult))

  return NextResponse.json({ id: created.user.id, emailDebug: (emailResult as any)?.error || null })
}
