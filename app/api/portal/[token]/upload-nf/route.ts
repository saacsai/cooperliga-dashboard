import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

async function validarSessao(sb: ReturnType<typeof getSupabaseAdmin>, token: string): Promise<string | null> {
  const { data: agregado } = await sb
    .from('agregados')
    .select('id')
    .eq('access_token', token)
    .single()
  if (!agregado) return null

  const sessionToken = cookies().get('coop_portal_session')?.value
  if (!sessionToken) return null

  const { data: session } = await sb
    .from('portal_sessions')
    .select('id')
    .eq('session_token', sessionToken)
    .eq('agregado_id', agregado.id)
    .gt('expires_at', new Date().toISOString())
    .single()

  return session ? agregado.id : null
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const sb = getSupabaseAdmin()

  const agregadoId = await validarSessao(sb, params.token)
  if (!agregadoId) {
    return NextResponse.json({ error: 'Sessão inválida. Recarregue a página.' }, { status: 401 })
  }

  const formData = await req.formData()
  const file       = formData.get('file') as File | null
  const pagamentoId = formData.get('pagamento_id') as string | null
  const nfNumero   = (formData.get('nf_numero') as string | null)?.trim() || null

  if (!file || !pagamentoId) {
    return NextResponse.json({ error: 'Arquivo e pagamento_id são obrigatórios' }, { status: 400 })
  }

  // Confirma que o pagamento pertence a este agregado e ainda aguarda NF
  const { data: pagamento } = await sb
    .from('pagamentos_agregados')
    .select('id')
    .eq('id', pagamentoId)
    .eq('agregado_id', agregadoId)
    .eq('status', 'aguardando_nf')
    .single()

  if (!pagamento) {
    return NextResponse.json({ error: 'Pagamento não encontrado ou já processado' }, { status: 404 })
  }

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'pdf'
  const path = `${agregadoId}/${pagamentoId}/nf.${ext}`

  const { error: uploadError } = await sb.storage
    .from('nfs-agregados')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: 'Erro ao salvar arquivo. Tente novamente.' }, { status: 500 })
  }

  await sb.from('pagamentos_agregados').update({
    status:     'nf_recebida',
    nf_arquivo: path,
    nf_numero:  nfNumero,
    updated_at: new Date().toISOString(),
  }).eq('id', pagamentoId)

  return NextResponse.json({ ok: true })
}
