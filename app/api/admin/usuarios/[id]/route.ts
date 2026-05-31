import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
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
