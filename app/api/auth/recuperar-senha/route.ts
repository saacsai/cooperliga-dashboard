import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { enviarRecuperacaoSenha } from '@/lib/email'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })

  const admin = getSupabaseAdmin()

  const { data: usuario } = await admin
    .from('usuarios')
    .select('nome')
    .eq('email', email)
    .single()

  // Se não existe usuário, retornamos ok mesmo assim (não revela se email existe)
  if (!usuario) return NextResponse.json({ ok: true })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cooperliga.saacs.com.br'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: 'Erro ao gerar link' }, { status: 500 })
  }

  const emailResult = await enviarRecuperacaoSenha({
    nome:  usuario.nome,
    email,
    link:  data.properties.action_link,
  })

  console.log('[recuperar-senha] resend result:', JSON.stringify(emailResult))

  if ((emailResult as any)?.error) {
    return NextResponse.json({ ok: false, debug: (emailResult as any).error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
