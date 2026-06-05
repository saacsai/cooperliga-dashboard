import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/pagamentos/nf-url?pagamento_id=xxx
// Chamado pelo dashboard do gestor para gerar URL assinada de uma NF arquivada.
// Auth: Bearer token do Supabase (sessão do gestor).

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data: { user }, error } = await sb.auth.getUser(auth.replace('Bearer ', ''))
  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const pagamentoId = req.nextUrl.searchParams.get('pagamento_id')
  if (!pagamentoId) {
    return NextResponse.json({ error: 'pagamento_id obrigatório' }, { status: 400 })
  }

  const { data: pagamento } = await sb
    .from('pagamentos_agregados')
    .select('nf_arquivo')
    .eq('id', pagamentoId)
    .single()

  if (!pagamento?.nf_arquivo) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const { data } = await sb.storage
    .from('nfs-agregados')
    .createSignedUrl(pagamento.nf_arquivo, 3600)

  return NextResponse.json({ url: data?.signedUrl })
}
