import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'
import { enviarBoasVindas } from '@/lib/email'
import type { Perfil } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  // Verifica se quem está chamando é admin
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null }

  // Fallback: verifica sessão via cookie (chamada do browser)
  let adminId = user?.id
  if (!adminId) {
    const { data: { session } } = await supabase.auth.getSession()
    adminId = session?.user?.id
  }

  if (!adminId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: caller } = await admin.from('usuarios').select('perfil').eq('id', adminId).single()
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

  // Envia email de boas-vindas (não-fatal: falha silenciosa)
  enviarBoasVindas({ nome, email, senha }).catch(() => {})

  return NextResponse.json({ id: created.user.id })
}
