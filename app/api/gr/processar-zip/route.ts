import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase'
import { createServerSupabase } from '@/lib/supabase-server'
import JSZip from 'jszip'

// CIE extraction: busca padrões CIE/CEI no texto do PDF via MCP SAACS worker
// O worker Python já tem a lógica de extração — chamamos via fetch ou fazemos localmente

// Regex para extração de CIE do texto bruto do PDF (MarkItDown converte o PDF para text)
const CIE_PATTERNS = [
  /CIE[:\s]+(\d+)/i,
  /CEI[:\s]+(\d+)/i,
  /C\.I\.E\.[:\s]+(\d+)/i,
  /Cód\.\s*da\s*Escola[:\s]+(\d+)/i,
]

function extrairCIE(texto: string): string | null {
  for (const pat of CIE_PATTERNS) {
    const m = texto.match(pat)
    if (m) return m[1].trim()
  }
  return null
}

// Calcula caixas e avulsas por produto
function calcularCaixas(quantidade: number, capacidade: number | null, unidade: string) {
  if (unidade === 'UNIDADE' && capacidade) {
    return {
      caixas_cheias: Math.floor(quantidade / capacidade),
      unidades_avulsas: quantidade % capacidade,
    }
  }
  if (unidade === 'CAIXA') return { caixas_cheias: quantidade, unidades_avulsas: 0 }
  return { caixas_cheias: null, unidades_avulsas: null }
}

export async function POST(req: NextRequest) {
  // Verifica autenticação
  const sbAuth = await createServerSupabase()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await sbAuth.from('usuarios').select('perfil').eq('id', user.id).single()
  if (!['admin', 'gestor'].includes(usuario?.perfil || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const form = await req.formData()
  const arquivo = form.get('arquivo') as File | null
  const ciclo = form.get('ciclo') as string | null
  const confirmar = form.get('confirmar') === '1'

  if (!arquivo || !ciclo) return NextResponse.json({ error: 'ZIP e ciclo são obrigatórios' }, { status: 400 })
  if (!/^\d{4}$/.test(ciclo)) return NextResponse.json({ error: 'Ciclo inválido' }, { status: 400 })
  if (arquivo.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'ZIP muito grande (máx 50MB)' }, { status: 400 })

  const sb = createServiceSupabase()

  // Carrega mapa CIE → ponto_de_entrega + rota
  const { data: pontos } = await sb
    .from('pontos_de_entrega')
    .select('id, nome, codigo_estado')
    .not('codigo_estado', 'is', null)

  const { data: rotaPontos } = await sb
    .from('rota_pontos')
    .select('rota_id, ponto_de_entrega_id, sequencia, rotas(id, codigo, nome, regiao, agregado_id)')

  const { data: produtos } = await sb
    .from('produtos')
    .select('id, nome, unidade_padrao, capacidade_por_caixa')

  const mapaCIE = new Map<string, { pontoId: string; nome: string }>(
    (pontos || []).map(p => [p.codigo_estado, { pontoId: p.id, nome: p.nome }])
  )

  const mapaRotaPonto = new Map<string, { rotaId: string; rotaCodigo: string; rotaNome: string; regiao: string | null; agregadoId: string | null; seq: number }>(
    (rotaPontos || []).map((rp: any) => [
      rp.ponto_de_entrega_id,
      {
        rotaId: rp.rota_id,
        rotaCodigo: rp.rotas?.codigo,
        rotaNome: rp.rotas?.nome,
        regiao: rp.rotas?.regiao || null,
        agregadoId: rp.rotas?.agregado_id || null,
        seq: rp.sequencia,
      },
    ])
  )

  // Extrai PDFs do ZIP
  const zipBuf = await arquivo.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuf)
  const pdfFiles = Object.entries(zip.files).filter(([name, f]) => !f.dir && name.toLowerCase().endsWith('.pdf') && !name.includes('__MACOSX'))

  // Para cada PDF: converte via MCP SAACS MarkItDown → extrai CIE → faz match
  const MCP_URL = process.env.MCP_SAACS_URL || 'https://mcp.saacs.com.br'
  const MCP_TOKEN = process.env.MCP_SAACS_TOKEN || ''

  const preview: {
    arquivo: string; cie: string | null; escola: string | null
    rota: string | null; seq: number | null; ok: boolean; aviso: string | null
    pontoId?: string; rotaId?: string; regiao?: string | null; agregadoId?: string | null
  }[] = []

  for (const [nome, entry] of pdfFiles) {
    const nomeArquivo = nome.split('/').pop() || nome
    const pdfBytes = await entry.async('arraybuffer')

    // Converte PDF via MCP MarkItDown
    let cie: string | null = null
    try {
      const fd2 = new FormData()
      fd2.append('arquivo', new Blob([pdfBytes], { type: 'application/pdf' }), nomeArquivo)
      const mcpRes = await fetch(`${MCP_URL}/api/ferramentas/converter-arquivo`, {
        method: 'POST',
        headers: MCP_TOKEN ? { Authorization: `Bearer ${MCP_TOKEN}` } : {},
        body: fd2,
      })
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json()
        const texto = mcpData.conteudo_md || ''
        cie = extrairCIE(texto)
      }
    } catch (e) {
      // fallback: sem CIE
    }

    if (!cie) {
      preview.push({ arquivo: nomeArquivo, cie: null, escola: null, rota: null, seq: null, ok: false, aviso: 'CIE não encontrado' })
      continue
    }

    const ponto = mapaCIE.get(cie)
    if (!ponto) {
      preview.push({ arquivo: nomeArquivo, cie, escola: null, rota: null, seq: null, ok: false, aviso: `CIE ${cie} não cadastrado` })
      continue
    }

    const rp = mapaRotaPonto.get(ponto.pontoId)
    if (!rp) {
      preview.push({ arquivo: nomeArquivo, cie, escola: ponto.nome, rota: null, seq: null, ok: false, aviso: 'Escola sem rota cadastrada' })
      continue
    }

    preview.push({
      arquivo: nomeArquivo,
      cie,
      escola: ponto.nome,
      rota: rp.rotaCodigo,
      seq: rp.seq,
      ok: true,
      aviso: null,
      pontoId: ponto.pontoId,
      rotaId: rp.rotaId,
      regiao: rp.regiao,
      agregadoId: rp.agregadoId,
    })
  }

  if (!confirmar) {
    return NextResponse.json({ preview })
  }

  // ── Confirmação: gera manifestos ─────────────────────────────
  // Agrupa GRs por rota
  const porRota = new Map<string, typeof preview>()
  for (const gr of preview.filter(g => g.ok)) {
    const arr = porRota.get(gr.rotaId!) || []
    arr.push(gr)
    porRota.set(gr.rotaId!, arr)
  }

  const manifestosGerados: string[] = []
  const dd = ciclo.slice(0, 2)
  const mm = ciclo.slice(2, 4)

  for (const [rotaId, grs] of porRota.entries()) {
    const primeiraGr = grs[0]
    const rotaCodigo = primeiraGr.rota!

    // Número do manifesto: CODIGO-DDMM
    const numero = `${rotaCodigo}-${ciclo}`

    // Busca manifesto anterior para retorno
    const { data: anterior } = await sb
      .from('manifestos')
      .select('id, caixas_enviadas')
      .eq('rota_id', rotaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const dataInicio = `2026-${mm}-${dd}`

    const { data: novoManifesto, error } = await sb
      .from('manifestos')
      .insert({
        numero,
        rota_id: rotaId,
        agregado_id: primeiraGr.agregadoId || null,
        regiao: primeiraGr.regiao || null,
        data_entrega_inicio: dataInicio,
        manifesto_retorno_ref_id: anterior?.id || null,
        caixas_esperadas_retorno: anterior?.caixas_enviadas || {},
        numero_whatsapp: '', // preenchido pelo trigger
      })
      .select('id, numero_whatsapp')
      .single()

    if (error || !novoManifesto) continue

    // Insere itens (1 por GR — sem produto específico ainda, quantidade 0)
    // Na Fase 2b o parser extrairá quantidades reais do MarkItDown
    const itens = grs.sort((a, b) => (a.seq || 0) - (b.seq || 0)).map((gr, idx) => ({
      manifesto_id: novoManifesto.id,
      ponto_de_entrega_id: gr.pontoId!,
      produto_id: produtos?.[0]?.id || null,  // produto padrão por ora
      sequencia: gr.seq || idx + 1,
      quantidade: 0,
      caixas_cheias: null,
      unidades_avulsas: null,
    }))

    await sb.from('manifesto_itens').insert(itens)
    manifestosGerados.push(novoManifesto.id)
  }

  return NextResponse.json({
    ok: true,
    manifestos_gerados: manifestosGerados.length,
    ids: manifestosGerados,
  })
}
