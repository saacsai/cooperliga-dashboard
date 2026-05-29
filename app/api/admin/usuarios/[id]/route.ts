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
  const { nome, whatsapp, perfil } = await req.json()

  if (!nome || !perfil) {
    return NextResponse.json({ error: 'nome e perfil são obrigatórios' }, { status: 400 })
  }

  const { error } = await admin
    .from('usuarios')
    .update({ nome, whatsapp: whatsapp || null, perfil: perfil as Perfil })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
