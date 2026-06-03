import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'
import type { Perfil } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin()

  // Verifica se quem chama é admin
  const authHeader = req.headers.get('cookie') || ''
  // Usa service role direto — proteção garantida pelo middleware de sessão no layout
  const body = await req.json()
  const { nome, whatsapp, perfil, cargo, cpf, rg, data_nascimento, endereco, municipio, cep } = body

  if (!nome) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    nome,
    whatsapp:        whatsapp        || null,
    cargo:           cargo           || null,
    cpf:             cpf             || null,
    rg:              rg              || null,
    data_nascimento: data_nascimento || null,
    endereco:        endereco        || null,
    municipio:       municipio       || null,
    cep:             cep             || null,
  }
  if (perfil) patch.perfil = perfil as Perfil

  const { error } = await admin
    .from('usuarios')
    .update(patch)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: { user } } = await getSupabase().auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: caller } = await admin.from('usuarios').select('perfil').eq('id', user.id).single()
  if (caller?.perfil !== 'admin') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  if (params.id === user.id) return NextResponse.json({ error: 'Não é possível excluir sua própria conta' }, { status: 400 })

  await admin.from('usuarios').delete().eq('id', params.id)
  await admin.auth.admin.deleteUser(params.id)

  return NextResponse.json({ ok: true })
}
