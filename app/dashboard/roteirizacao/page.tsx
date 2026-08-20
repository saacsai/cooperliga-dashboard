'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { getSupabase } from '@/lib/supabase'

const MapaPontos = dynamic(() => import('@/components/MapaPontos'), { ssr: false })

const PRIMARY = '#072740'
const WORKER  = 'https://guias.cooperliga.saacs.com.br'
const MAX_PRODUTOS = 10

type Tipo = 'estado' | 'municipal'
type Fase = 'parametros' | 'upload' | 'pontos' | 'rotas'

interface PontoExtraido {
  codigo_prefeitura?: string
  gr_numero?: string
  cie?: string
  diretoria?: string
  nome_escola?: string
  nome?: string
  endereco?: string
  municipio?: string
  cep?: string
  produto?: string
  quantidade?: number
  qtde_inteira?: number
  qtde_fracionada?: number
}

type Qtde = { inteira: number; fracionada: number; gr_numero?: string }

interface PontoComGeo {
  ponto_id: string
  codigo: string
  nome: string
  endereco: string
  municipio?: string
  lat?: number
  lng?: number
  qtdes: Record<string, Qtde> // produto_id -> quantidade
  geo_status?: string
  diretoria?: string
}

interface RotaSugerida {
  ordem: number
  veiculo_sugerido: string
  total_entregas: number
  total_caixas: number
  pontos: Array<{ ponto_id: string; nome: string; ordem: number; lat?: number; lng?: number; qtdes: Record<string, Qtde> }>
}

type Produto = { id: string; nome: string; capacidade_por_caixa: number | null }
// grFiles: PDFs de GR crus dessa mesma planilha (só Municipal — Estado já
// manda a GR dentro do próprio zip usado na extração, reaproveitado depois).
type ProdutoSlot = { produtoId: string; arquivo: File | null; grFiles: File[] }

const VEICULOS = ['fiorino', 'hr', 'iveco', 'outro']

function Badge({ label, cor }: { label: string; cor: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: `${cor}20`, color: cor }}>
      {label}
    </span>
  )
}

function PassoHeader({ n, label, ativo }: { n: number; label: string; ativo: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: ativo ? PRIMARY : '#e5e7eb', color: ativo ? '#fff' : '#9ca3af' }}>
        {n}
      </div>
      <h2 className="text-base font-semibold" style={{ color: ativo ? '#111' : '#9ca3af' }}>{label}</h2>
    </div>
  )
}

// Arredonda a fracionada pra caixa UMA VEZ (soma primeiro, arredonda depois) —
// espelha exatamente o que o worker faz em /roteirizar, usado aqui só pra
// recalcular o total na tela depois que a pessoa move um ponto entre rotas
// (sem precisar chamar o worker de novo).
function calcularTotalCaixas(pontos: RotaSugerida['pontos'], capacidades: Record<string, number>): number {
  const somas: Record<string, Qtde> = {}
  for (const p of pontos) {
    for (const [prodId, q] of Object.entries(p.qtdes)) {
      if (!somas[prodId]) somas[prodId] = { inteira: 0, fracionada: 0 }
      somas[prodId].inteira    += q.inteira
      somas[prodId].fracionada += q.fracionada
    }
  }
  let total = 0
  for (const [prodId, q] of Object.entries(somas)) {
    const capacidade = capacidades[prodId] || 12
    total += q.inteira + Math.ceil(q.fracionada / capacidade)
  }
  return total
}

export default function RoteirizacaoPage() {
  const [fase,      setFase]     = useState<Fase>('parametros')
  const [tipo,      setTipo]     = useState<Tipo>('municipal')
  const [carregando, setCarreg]  = useState(false)
  const [erro,      setErro]     = useState('')
  const [avisos,    setAvisos]   = useState<string[]>([])

  // Passo 1 — Parâmetros (agora vem antes do upload, porque o nº de
  // produtos já define quanto tempo cada entrega leva e quantos slots de
  // planilha aparecem no passo seguinte).
  const [regiao,      setRegiao]      = useState('')
  const [dataCiclo,   setDataCiclo]   = useState('') // YYYY-MM-DD
  const [numProd,     setNumProd]     = useState(1)
  const [maxEntregas, setMaxEnt]      = useState(25)

  // Passo 2 — Upload: um slot (arquivo + produto) por produto declarado.
  const [produtos,     setProdutos]     = useState<Produto[]>([])
  const [produtoSlots, setProdutoSlots] = useState<ProdutoSlot[]>([{ produtoId: '', arquivo: null, grFiles: [] }])
  const [numerosPedido, setNumerosPedido] = useState<Record<string, string>>({}) // produto_id -> numero_pedido (pra virar ciclo)

  // Fase pontos (conferência)
  const [pontosGeo, setPontosGeo]   = useState<PontoComGeo[]>([])
  const [geocodando, setGeocodando] = useState(false)

  // Fase rotas
  const [rotas,      setRotas]    = useState<RotaSugerida[]>([])
  const [veiculos,   setVeiculos] = useState<string[]>([])
  const [confirmando, setConf]    = useState(false)
  const [confirmado,  setConfirm] = useState(false)
  const [manifestoIds, setManifestoIds] = useState<string[]>([]) // ciclo_manifestos.id gerados, pra alinhar as GRs depois

  // Mapa
  const [mostraMapa, setMostraMapa] = useState(false)

  // Coordenadas manuais — modal flutuante
  const [editandoGeo,  setEditandoGeo]  = useState<string | null>(null)
  const [editandoNome, setEditandoNome] = useState('')
  const [latInput,     setLatInput]     = useState('')
  const [lngInput,     setLngInput]     = useState('')
  const [cepInput,     setCepInput]     = useState('')
  const [bairroInput,  setBairroInput]  = useState('')
  const [municipioInput, setMunicipioInput] = useState('')
  const [salvandoGeo,  setSalvandoGeo]  = useState(false)

  useEffect(() => {
    getSupabase().from('produtos').select('id, nome, capacidade_por_caixa').eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos((data || []) as Produto[]))
  }, [])

  // Capacidades por produto usado nesta sessão — usadas tanto pra mandar
  // pro worker quanto pra recalcular total na tela depois de mover ponto.
  const capacidadesPorProduto: Record<string, number> = {}
  for (const p of produtos) capacidadesPorProduto[p.id] = p.capacidade_por_caixa || 12

  function ajustarNumProd(n: number) {
    const v = Math.max(1, Math.min(MAX_PRODUTOS, n))
    setNumProd(v)
    setProdutoSlots(prev => {
      const next = [...prev]
      while (next.length < v) next.push({ produtoId: '', arquivo: null, grFiles: [] })
      return next.slice(0, v)
    })
  }

  function setSlot(i: number, patch: Partial<ProdutoSlot>) {
    setProdutoSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  function abrirModal(pontoId: string) {
    const p = pontosGeo.find(x => x.ponto_id === pontoId)
    setEditandoGeo(pontoId)
    setEditandoNome(p?.nome || '')
    setLatInput('')
    setLngInput('')
    setCepInput('')
    setBairroInput('')
    setMunicipioInput(p?.municipio || '')
  }

  // ── Passo 2: upload e extração (N planilhas) ────────────────────────────────
  async function handleExtrair() {
    const slotsAtivos = produtoSlots.filter(s => s.arquivo)
    if (!slotsAtivos.length) { setErro('Selecione ao menos uma planilha'); return }
    if (slotsAtivos.some(s => !s.produtoId)) { setErro('Selecione o produto de cada planilha enviada'); return }

    setCarreg(true); setErro(''); setAvisos([])
    try {
      const extraidosPorProduto: { produtoId: string; pontos: PontoExtraido[] }[] = []
      const novosNumeros: Record<string, string> = {}

      for (const slot of slotsAtivos) {
        const fd  = new FormData()
        const url = tipo === 'municipal' ? `${WORKER}/extrair-prefeitura` : `${WORKER}/extrair-estado`
        fd.append(tipo === 'municipal' ? 'xls' : 'zip_grs', slot.arquivo!)

        const res  = await fetch(url, { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.detail || JSON.stringify(json))

        extraidosPorProduto.push({ produtoId: slot.produtoId, pontos: json.pontos || [] })
        if (json.avisos?.length) setAvisos(prev => [...prev, ...json.avisos])

        const produtoNome = produtos.find(p => p.id === slot.produtoId)?.nome || slot.produtoId
        novosNumeros[slot.produtoId] = json.numero_solicitacao
          ? String(json.numero_solicitacao)
          : `ESTADO-${dataCiclo || 'sem-data'}-${produtoNome}`
      }
      setNumerosPedido(novosNumeros)

      // detectar região automaticamente a partir do primeiro arquivo
      if (!regiao) {
        const dirs = new Set(extraidosPorProduto[0]?.pontos.map(p => p.diretoria).filter(Boolean))
        if (dirs.size === 1) setRegiao(Array.from(dirs)[0] as string)
      }

      await consolidarEGeocodificar(extraidosPorProduto)
      setFase('pontos')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao extrair')
    } finally {
      setCarreg(false)
    }
  }

  // Consolida os pontos de todas as planilhas (por código) num único
  // registro por ponto, com as quantidades de cada produto separadas —
  // e só então geocodifica/casa com pontos_de_entrega, uma vez por ponto.
  async function consolidarEGeocodificar(extraidosPorProduto: { produtoId: string; pontos: PontoExtraido[] }[]) {
    const sb = getSupabase()

    type Consolidado = { nome: string; endereco: string; municipio?: string; diretoria?: string; qtdes: Record<string, Qtde> }
    const porCodigo = new Map<string, Consolidado>()

    for (const { produtoId, pontos } of extraidosPorProduto) {
      for (const p of pontos) {
        const codigo = p.codigo_prefeitura || p.cie || ''
        if (!codigo) continue
        const nome = p.nome || p.nome_escola || `Ponto ${codigo}`

        let entry = porCodigo.get(codigo)
        if (!entry) {
          entry = { nome, endereco: p.endereco || '', municipio: p.municipio, diretoria: p.diretoria, qtdes: {} }
          porCodigo.set(codigo, entry)
        }

        const inteira    = tipo === 'municipal' ? (p.qtde_inteira || 0) : 0
        const fracionada = tipo === 'municipal' ? (p.qtde_fracionada || 0) : (p.quantidade || 0)
        entry.qtdes[produtoId] = { inteira, fracionada, gr_numero: p.gr_numero }
      }
    }

    // Aviso não-bloqueante: ponto que não pediu algum dos produtos selecionados
    const produtoIdsUsados = extraidosPorProduto.map(e => e.produtoId)
    const novosAvisos: string[] = []
    for (const [codigo, entry] of Array.from(porCodigo.entries())) {
      const faltando = produtoIdsUsados.filter(pid => !entry.qtdes[pid])
      if (faltando.length) {
        const nomes = faltando.map(pid => produtos.find(pr => pr.id === pid)?.nome || pid).join(', ')
        novosAvisos.push(`${entry.nome} (${codigo}) não pediu: ${nomes}`)
      }
    }
    if (novosAvisos.length) setAvisos(prev => [...prev, ...novosAvisos])

    const col = tipo === 'municipal' ? 'codigo_prefeitura' : 'codigo_estado'
    const resultado: PontoComGeo[] = []

    for (const [codigo, entry] of Array.from(porCodigo.entries())) {
      const { data } = await sb
        .from('pontos_de_entrega')
        .select('id, lat, lng, geo_status, municipio')
        .eq(col, codigo)
        .limit(1)
        .single()

      if (data) {
        resultado.push({
          ponto_id:  data.id,
          codigo,
          nome:      entry.nome,
          endereco:  entry.endereco,
          municipio: data.municipio ?? entry.municipio,
          lat:       data.lat ?? undefined,
          lng:       data.lng ?? undefined,
          qtdes:     entry.qtdes,
          geo_status: data.geo_status || 'pendente',
          diretoria: entry.diretoria,
        })
      } else {
        const { data: novo } = await sb
          .from('pontos_de_entrega')
          .insert({
            nome: entry.nome,
            endereco:  entry.endereco || null,
            municipio: entry.municipio || (tipo === 'municipal' ? 'São Paulo' : null),
            [col]: codigo,
            origem: tipo === 'municipal' ? 'prefeitura' : 'estado',
            geo_status: 'pendente',
          })
          .select('id')
          .single()

        resultado.push({
          ponto_id: novo?.id || '',
          codigo,
          nome: entry.nome,
          endereco: entry.endereco,
          qtdes: entry.qtdes,
          geo_status: 'pendente',
          diretoria: entry.diretoria,
        })
      }
    }
    setPontosGeo(resultado)
  }

  // Re-busca lat/lng/geo_status atualizados pros pontos já consolidados —
  // usado depois de geocodificar em lote, regeocodificar 1 ponto ou salvar
  // coordenadas manuais. Não precisa reprocessar as planilhas de novo.
  async function recarregarGeo() {
    const sb  = getSupabase()
    const ids = pontosGeo.map(p => p.ponto_id).filter(Boolean)
    if (!ids.length) return
    const { data } = await sb.from('pontos_de_entrega').select('id, lat, lng, geo_status, municipio').in('id', ids)
    const byId = new Map((data || []).map(d => [d.id, d]))
    setPontosGeo(prev => prev.map(p => {
      const d = byId.get(p.ponto_id)
      if (!d) return p
      return { ...p, lat: d.lat ?? undefined, lng: d.lng ?? undefined, geo_status: d.geo_status || p.geo_status, municipio: d.municipio ?? p.municipio }
    }))
  }

  // ── Geocodificar pontos pendentes ───────────────────────────────────────────
  async function handleGeocodificar() {
    const ids = pontosGeo.filter(p => p.ponto_id && (!p.lat || !p.lng)).map(p => p.ponto_id)
    if (!ids.length) return
    setGeocodando(true)
    try {
      const res  = await fetch('/api/geocodificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json()
      await recarregarGeo()
      setAvisos(prev => [...prev, `Geocodificados: ${json.processados} pontos`])
    } catch {
      setErro('Erro ao geocodificar')
    } finally {
      setGeocodando(false)
    }
  }

  // ── Regeocodificar ponto individual ───────────────────────────────────────
  const [regeocodando, setRegeocodando] = useState<string | null>(null) // ponto_id

  async function regeocodificar(pontoId: string) {
    setRegeocodando(pontoId)
    try {
      await fetch('/api/geocodificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [pontoId] }),
      })
      await recarregarGeo()
    } finally {
      setRegeocodando(null)
    }
  }

  // ── Coordenadas manuais ────────────────────────────────────────────────────
  async function salvarCoordenadas(pontoId: string) {
    const lat = parseFloat(latInput.replace(',', '.'))
    const lng = parseFloat(lngInput.replace(',', '.'))
    if (isNaN(lat) || isNaN(lng)) return
    setSalvandoGeo(true)
    try {
      const sb = getSupabase()
      const update: Record<string, unknown> = { lat, lng, geo_status: 'ok' }
      if (cepInput.trim())      update.cep      = cepInput.trim().replace(/\D/g, '')
      if (bairroInput.trim())   update.bairro   = bairroInput.trim()
      if (municipioInput.trim()) update.municipio = municipioInput.trim()
      await sb.from('pontos_de_entrega').update(update).eq('id', pontoId)
      await recarregarGeo()
      setEditandoGeo(null)
    } finally {
      setSalvandoGeo(false)
    }
  }

  // ── Gerar sugestão de rotas ─────────────────────────────────────────────────
  async function handleCalcular() {
    setCarreg(true); setErro('')
    try {
      const payload = {
        pontos: pontosGeo
          .filter(p => p.ponto_id && p.lat && p.lng)
          .map(p => ({
            ponto_id: p.ponto_id,
            lat:      p.lat,
            lng:      p.lng,
            nome:     p.nome,
            qtdes:    p.qtdes,
          })),
        capacidades:  capacidadesPorProduto,
        num_produtos: numProd,
        max_entregas: maxEntregas,
      }
      const res  = await fetch(`${WORKER}/roteirizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Erro ao calcular')
      const rs: RotaSugerida[] = json.rotas || []
      setRotas(rs)
      setVeiculos(rs.map((r: RotaSugerida) => r.veiculo_sugerido))
      if (json.avisos?.length) setAvisos(prev => [...prev, ...json.avisos])

      setFase('rotas')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao calcular rotas')
    } finally {
      setCarreg(false)
    }
  }

  // Move um ponto de uma rota sugerida pra outra e recalcula os totais das duas.
  function moverPonto(pontoId: string, deOrdem: number, paraOrdem: number) {
    if (deOrdem === paraOrdem) return
    setRotas(prev => {
      const next = prev.map(r => ({ ...r, pontos: [...r.pontos] }))
      const origem  = next.find(r => r.ordem === deOrdem)
      const destino = next.find(r => r.ordem === paraOrdem)
      if (!origem || !destino) return prev

      const idx = origem.pontos.findIndex(p => p.ponto_id === pontoId)
      if (idx === -1) return prev
      const [ponto] = origem.pontos.splice(idx, 1)
      destino.pontos.push(ponto)

      origem.pontos  = origem.pontos.map((p, i) => ({ ...p, ordem: i + 1 }))
      destino.pontos = destino.pontos.map((p, i) => ({ ...p, ordem: i + 1 }))
      origem.total_entregas  = origem.pontos.length
      destino.total_entregas = destino.pontos.length
      origem.total_caixas  = calcularTotalCaixas(origem.pontos, capacidadesPorProduto)
      destino.total_caixas = calcularTotalCaixas(destino.pontos, capacidadesPorProduto)

      return next
    })
  }

  // ── Confirmar: grava ciclo(s) + manifesto(s) reais, sem rota nenhuma —
  // agregado/motorista fica pra atribuir depois, direto no manifesto, no
  // momento do carregamento (não é mais pré-requisito daqui). ───────────────
  async function handleConfirmar() {
    if (!regiao) { setErro('Informe a região antes de confirmar'); return }

    setConf(true); setErro('')
    const sb = getSupabase()

    try {
      // 1. Upsert 1 ciclo por produto usado nesta roteirização
      const cicloIdPorProduto: Record<string, string> = {}
      for (const [produtoId, numeroPedido] of Object.entries(numerosPedido)) {
        const { data: ciclo, error } = await sb.from('ciclos')
          .upsert({ numero_pedido: numeroPedido, data_entrega: dataCiclo }, { onConflict: 'numero_pedido' })
          .select('id').single()
        if (error || !ciclo) throw new Error(error?.message || 'Erro ao criar ciclo')
        cicloIdPorProduto[produtoId] = ciclo.id
      }

      // 2. Por rota sugerida: ciclo_entregas por ponto×produto + manifesto
      // próprio (nasce solto, sem rota — cada rota sugerida vira 1 manifesto novo)
      const novosManifestoIds: string[] = []
      const todosPdeIds = new Set<string>()
      for (const r of rotas) {
        for (const p of r.pontos) {
          for (const [produtoId, q] of Object.entries(p.qtdes)) {
            const cicloId = cicloIdPorProduto[produtoId]
            if (!cicloId) continue
            await sb.from('ciclo_entregas').upsert({
              ciclo_id: cicloId,
              ponto_de_entrega_id: p.ponto_id,
              produto_id: produtoId,
              qtde_inteira:    q.inteira,
              qtde_fracionada: q.fracionada,
              gr_numero:       q.gr_numero || null,
            }, { onConflict: 'ciclo_id,ponto_de_entrega_id,produto_id' })
          }
        }

        const { data: novoManifesto, error } = await sb.from('ciclo_manifestos')
          .insert({ data_entrega: dataCiclo, regiao })
          .select('id').single()
        if (error || !novoManifesto) throw new Error(error?.message || 'Erro ao criar manifesto')

        for (let i = 0; i < r.pontos.length; i++) {
          await sb.from('manifesto_pontos').insert(
            { manifesto_id: novoManifesto.id, pde_id: r.pontos[i].ponto_id, sequencia: i + 1 }
          )
          todosPdeIds.add(r.pontos[i].ponto_id)
        }
        novosManifestoIds.push(novoManifesto.id)
      }
      setManifestoIds(novosManifestoIds)

      // 2b. Marca a região em cada ponto de entrega tocado nesta roteirização —
      // substitui o antigo agrupamento por `rotas`, mantendo o filtro por
      // região em Pontos de Entrega funcionando sem a tabela `rotas`.
      if (todosPdeIds.size) {
        await sb.from('pontos_de_entrega').update({ regiao }).in('id', Array.from(todosPdeIds))
      }

      // 3. Alinha as guias de remessa contra os manifestos recém-criados e
      // já baixa o PDF pronto — não bloqueia a confirmação se falhar (os
      // manifestos já estão salvos; dá pra tentar alinhar de novo depois).
      await alinharGuias(novosManifestoIds)

      setConfirm(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao confirmar')
    } finally {
      setConf(false)
    }
  }

  async function alinharGuias(ids: string[]) {
    const fd = new FormData()
    fd.append('manifesto_ids', ids.join(','))
    fd.append('tipo', tipo)

    if (tipo === 'municipal') {
      const grFiles = produtoSlots.flatMap(s => s.grFiles)
      if (!grFiles.length) return // ninguém subiu GR ainda — pula alinhamento por agora
      for (const f of grFiles) fd.append('pdf_grs', f)
    } else {
      const zip = produtoSlots.find(s => s.arquivo)?.arquivo
      if (!zip) return
      fd.append('zip_grs', zip)
    }

    try {
      const res = await fetch(`${WORKER}/alinhar-manifesto`, { method: 'POST', body: fd })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setAvisos(prev => [...prev, `Alinhamento das guias falhou: ${json.detail || res.statusText}`])
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'guias_alinhadas.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setAvisos(prev => [...prev, `Alinhamento das guias falhou: ${e instanceof Error ? e.message : 'erro desconhecido'}`])
    }
  }

  const comGeo   = pontosGeo.filter(p => p.lat && p.lng).length
  const semGeo   = pontosGeo.filter(p => !p.lat || !p.lng).length
  const pendGeo  = pontosGeo.filter(p => p.ponto_id && (!p.lat || !p.lng)).length

  if (confirmado) {
    return (
      <div className="max-w-lg pt-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Manifestos gerados</h2>
          <p className="text-sm text-gray-500 mb-6">
            {rotas.length} manifesto{rotas.length !== 1 ? 's' : ''} pronto{rotas.length !== 1 ? 's' : ''}.
            {avisos.some(a => a.startsWith('Alinhamento'))
              ? ' As guias não puderam ser alinhadas automaticamente — veja o aviso abaixo, ainda dá pra tentar de novo depois.'
              : ' As guias já foram baixadas alinhadas — atribua o motorista/veículo em Manifestos quando for carregar.'}
          </p>
          {avisos.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left max-h-32 overflow-y-auto">
              {avisos.map((a, i) => <p key={i} className="text-xs text-amber-700">{a}</p>)}
              {avisos.some(a => a.startsWith('Alinhamento')) && manifestoIds.length > 0 && (
                <button onClick={() => alinharGuias(manifestoIds)} disabled={carregando}
                  className="mt-2 text-xs font-medium underline text-amber-800">
                  Tentar alinhar as guias de novo
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <a href="/dashboard/manifestos"
              className="px-6 py-2 rounded-lg text-sm font-medium btn-brand">
              Ver manifestos
            </a>
            <button
              onClick={() => {
                setFase('parametros'); setConfirm(false); setRotas([]); setPontosGeo([])
                setProdutoSlots([{ produtoId: '', arquivo: null, grFiles: [] }]); setNumProd(1)
                setRegiao(''); setDataCiclo(''); setAvisos([]); setManifestoIds([])
              }}
              className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Nova roteirização
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl pt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Roteirização</h1>
      <p className="text-sm text-gray-500 mb-6">Sugere e salva rotas/manifestos a partir das planilhas do ciclo</p>

      {/* ── Passo 1: Parâmetros ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <PassoHeader n={1} label="Parâmetros da operação" ativo={fase === 'parametros'} />

        {fase === 'parametros' ? (
          <>
            <div className="flex gap-2 mb-5">
              {(['municipal', 'estado'] as Tipo[]).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
                  style={{ background: tipo === t ? PRIMARY : '#eef6fc', color: tipo === t ? '#fff' : '#6b7280', borderColor: tipo === t ? PRIMARY : '#e5e7eb' }}>
                  {t === 'municipal' ? 'Prefeitura (XLSX)' : 'Estado (ZIP de PDFs)'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Região / Diretoria</label>
                <input type="text" value={regiao} onChange={e => setRegiao(e.target.value)}
                  placeholder="Ex: SUL 2 ou VILA YOLANDA II"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data de entrega</label>
                <input type="date" value={dataCiclo} onChange={e => setDataCiclo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantos produtos?</label>
                <input type="number" min={1} max={MAX_PRODUTOS} value={numProd} onChange={e => ajustarNumProd(+e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
                <p className="text-[10px] text-gray-400 mt-0.5">Fator de tempo: {(1 + (numProd - 1) * 0.25).toFixed(2)}× · até {MAX_PRODUTOS} produtos</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Máx. entregas / motorista</label>
                <input type="number" min={5} max={50} value={maxEntregas} onChange={e => setMaxEnt(+e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
                <p className="text-[10px] text-gray-400 mt-0.5">Efetivas: {Math.floor(maxEntregas / (1 + (numProd - 1) * 0.25))} entregas</p>
              </div>
            </div>

            {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

            <button onClick={() => { setErro(''); setFase('upload') }}
              disabled={!regiao.trim() || !dataCiclo}
              className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 btn-brand">
              Continuar para upload das planilhas
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
            <span>{regiao} · {dataCiclo.split('-').reverse().join('/')} · {numProd} produto{numProd !== 1 ? 's' : ''} · {maxEntregas} entregas/motorista</span>
            {fase !== 'rotas' && (
              <button onClick={() => setFase('parametros')} className="text-xs underline" style={{ color: PRIMARY }}>
                Alterar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Passo 2: Upload (N planilhas, uma por produto) ── */}
      {(fase === 'upload' || fase === 'pontos' || fase === 'rotas') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <PassoHeader n={2} label="Upload das planilhas" ativo={fase === 'upload'} />

          {fase === 'upload' ? (
            <>
              <p className="text-xs text-gray-500 mb-4">
                Uma planilha por produto{tipo === 'municipal' ? ' — sobe junto os PDFs de GR dessa mesma remessa' : ''} — deixe o slot vazio se não tiver a planilha desse produto ainda.
              </p>
              <div className="space-y-3 mb-5">
                {produtoSlots.map((slot, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={slot.produtoId} onChange={e => setSlot(i, { produtoId: e.target.value })}
                        className="w-40 flex-shrink-0 border border-gray-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-[#072740]">
                        <option value="">Produto…</option>
                        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                      <label className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 cursor-pointer hover:border-gray-300 min-w-0">
                        <span className="truncate">{slot.arquivo ? slot.arquivo.name : `Selecionar planilha ${i + 1}…`}</span>
                        <input
                          type="file"
                          accept={tipo === 'municipal' ? '.xlsx,.xls' : '.zip'}
                          className="sr-only"
                          onChange={e => setSlot(i, { arquivo: e.target.files?.[0] || null })}
                        />
                      </label>
                      {slot.arquivo && (
                        <button type="button" onClick={() => setSlot(i, { arquivo: null })}
                          className="text-xs text-gray-300 hover:text-red-500 flex-shrink-0">✕</button>
                      )}
                    </div>
                    {tipo === 'municipal' && (
                      <label className="flex items-center gap-2 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 text-[11px] text-gray-400 cursor-pointer hover:border-gray-300 ml-[168px]">
                        <span className="truncate">
                          {slot.grFiles.length
                            ? `${slot.grFiles.length} PDF${slot.grFiles.length !== 1 ? 's' : ''} de GR selecionado${slot.grFiles.length !== 1 ? 's' : ''}`
                            : 'PDFs de GR desta remessa (opcional, pode subir depois)'}
                        </span>
                        <input
                          type="file"
                          accept=".pdf"
                          multiple
                          className="sr-only"
                          onChange={e => setSlot(i, { grFiles: Array.from(e.target.files || []) })}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

              <button onClick={handleExtrair} disabled={carregando}
                className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 btn-brand">
                {carregando ? 'Extraindo…' : 'Extrair pontos'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="font-medium">{pontosGeo.length} pontos extraídos</span>
              <span className="text-gray-300">·</span>
              <span>{produtoSlots.filter(s => s.arquivo).length} planilha{produtoSlots.filter(s => s.arquivo).length !== 1 ? 's' : ''}</span>
              {fase !== 'rotas' && (
                <button onClick={() => setFase('upload')} className="text-xs underline" style={{ color: PRIMARY }}>
                  Alterar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Passo 3: Conferência ── */}
      {(fase === 'pontos' || fase === 'rotas') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <PassoHeader n={3} label="Conferência dos pontos" ativo={fase === 'pontos'} />

          {fase === 'pontos' ? (
            <>
              <div className="flex items-center gap-4 mb-2">
                <Badge label={`${comGeo} com geo`}   cor="#16a34a" />
                <Badge label={`${semGeo} sem geo`}   cor={semGeo > 0 ? '#d97706' : '#9ca3af'} />
                {pontosGeo.some(p => !p.ponto_id) && (
                  <Badge label={`${pontosGeo.filter(p => !p.ponto_id).length} novos`} cor="#7c3aed" />
                )}
              </div>
              <p className="text-[10px] text-gray-400 mb-4">🟢 geocodificado · 🔴 endereço não encontrado · ⚫ sem endereço · 🟡 pendente</p>

              {pendGeo > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800">{pendGeo} pontos sem coordenadas</p>
                    <p className="text-xs text-amber-600">Geocodificar melhora a qualidade das rotas sugeridas</p>
                  </div>
                  <button onClick={handleGeocodificar} disabled={geocodando}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 flex-shrink-0">
                    {geocodando ? 'Geocodificando…' : 'Geocodificar'}
                  </button>
                </div>
              )}

              <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr_2fr_1fr_auto_auto] text-xs font-semibold text-gray-500 bg-gray-50 px-3 py-2 gap-2">
                  <span>Código</span><span>Nome</span><span>Qtde</span><span>Geo</span><span></span>
                </div>
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {pontosGeo.map((p, i) => {
                    const totalCx = calcularTotalCaixas([{ ponto_id: p.ponto_id, nome: p.nome, ordem: 0, qtdes: p.qtdes }], capacidadesPorProduto)
                    const tooltip = Object.entries(p.qtdes)
                      .map(([pid, q]) => `${produtos.find(pr => pr.id === pid)?.nome || pid}: ${q.inteira}cx + ${q.fracionada}pc`)
                      .join(' · ')
                    return (
                      <div key={i}>
                        <div className="grid grid-cols-[1fr_2fr_1fr_auto_auto] px-3 py-2 gap-2 text-xs items-center">
                          <span className="text-gray-500 font-mono">{p.codigo}</span>
                          <span className="text-gray-800 truncate">{p.nome}</span>
                          <span className="text-gray-700" title={tooltip}>~{totalCx}cx</span>
                          <span title={p.lat && p.lng ? `${p.lat?.toFixed(4)}, ${p.lng?.toFixed(4)}` : 'Sem coordenadas'}>
                            {p.lat && p.lng ? '🟢' : p.geo_status === 'nao_encontrado' ? '🔴' : p.geo_status === 'sem_endereco' ? '⚫' : '🟡'}
                          </span>
                          {p.ponto_id && p.lat && p.lng && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => regeocodificar(p.ponto_id)}
                                disabled={regeocodando === p.ponto_id}
                                className="text-[10px] text-gray-300 hover:text-blue-400 leading-none disabled:opacity-50"
                                title="Regeocodificar (busca novamente no Google Maps)"
                              >{regeocodando === p.ponto_id ? '…' : '↺'}</button>
                              <button
                                onClick={() => abrirModal(p.ponto_id)}
                                className="text-[10px] text-gray-300 hover:text-gray-500 leading-none"
                                title="Corrigir coordenadas manualmente"
                              >✎</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {pontosGeo.some(p => !p.lat && (p.geo_status === 'nao_encontrado' || p.geo_status === 'sem_endereco')) && (
                <details className="mb-4 border border-red-100 rounded-lg overflow-hidden">
                  <summary className="px-3 py-2 bg-red-50 text-xs font-medium text-red-700 cursor-pointer list-none flex items-center gap-2">
                    <span>▸</span>
                    <span>
                      {pontosGeo.filter(p => !p.lat && (p.geo_status === 'nao_encontrado' || p.geo_status === 'sem_endereco')).length} pontos com falha — inserir coordenadas manualmente
                    </span>
                  </summary>
                  <div className="px-3 py-2 bg-red-50 border-b border-red-100">
                    <p className="text-[10px] text-red-500">Pesquise o endereço no Google Maps → clique com botão direito na localização → copie as coordenadas (ex: -23.6234, -46.6789)</p>
                  </div>
                  <div className="divide-y divide-red-50 max-h-96 overflow-y-auto">
                    {pontosGeo
                      .filter(p => !p.lat && (p.geo_status === 'nao_encontrado' || p.geo_status === 'sem_endereco'))
                      .map((p, i) => (
                        <div key={i} className="px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-mono text-gray-400 flex-shrink-0">{p.codigo}</span>
                                <span className="font-medium text-gray-700 truncate">{p.nome}</span>
                              </div>
                              <p className="text-red-400 font-mono truncate">{p.endereco || 'Sem endereço'}</p>
                            </div>
                            <button
                              onClick={() => abrirModal(p.ponto_id)}
                              className="flex-shrink-0 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                            >
                              ✎ Inserir coords
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </details>
              )}

              {comGeo > 0 && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setMostraMapa(m => !m)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
                  >
                    <span>{mostraMapa ? '▾' : '▸'}</span>
                    {mostraMapa ? 'Ocultar mapa' : `Ver mapa dos ${comGeo} pontos geocodificados`}
                  </button>
                  {mostraMapa && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
                      <MapaPontos
                        pontos={pontosGeo
                          .filter(p => p.lat && p.lng)
                          .map(p => ({
                            ponto_id: p.ponto_id,
                            lat: p.lat!,
                            lng: p.lng!,
                            nome: p.nome,
                            codigo: p.codigo,
                            endereco: p.endereco,
                            qtde_caixas: calcularTotalCaixas([{ ponto_id: p.ponto_id, nome: p.nome, ordem: 0, qtdes: p.qtdes }], capacidadesPorProduto),
                          }))}
                        onRegeocodificar={regeocodificar}
                        onEditarGeo={abrirModal}
                      />
                    </div>
                  )}
                </div>
              )}

              {avisos.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Avisos ({avisos.length})</p>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {avisos.map((a, i) => <p key={i} className="text-xs text-gray-500">{a}</p>)}
                  </div>
                </div>
              )}

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

              {comGeo === 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Nenhum ponto tem geocoordenadas. As rotas serão sugeridas sem agrupamento geográfico.
                    Geocodifique os pontos para resultados melhores.
                  </p>
                </div>
              )}
              {semGeo > 0 && comGeo > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">{semGeo} pontos sem coordenadas</span> serão excluídos do cálculo.
                    Rotas geradas a partir dos <span className="font-semibold">{comGeo} pontos geocodificados</span>.
                  </p>
                </div>
              )}

              <button onClick={handleCalcular} disabled={carregando}
                className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 btn-brand">
                {carregando ? 'Calculando…' : 'Gerar sugestão de rotas'}
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">{comGeo} com geo · {semGeo} sem geo</p>
          )}
        </div>
      )}

      {/* ── Passo 4: Rotas sugeridas → manifestos ── */}
      {fase === 'rotas' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <PassoHeader n={4} label="Ajuste e confirmação" ativo />

          {rotas.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma rota sugerida. Verifique os dados e tente novamente.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {rotas.map((rota, i) => {
                  return (
                    <div key={i} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Manifesto {rota.ordem}</span>
                        <span className="text-xs text-gray-400">{rota.total_entregas} entregas · {rota.total_caixas} cx</span>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Veículo sugerido</label>
                        <select value={veiculos[i] || rota.veiculo_sugerido}
                          onChange={e => setVeiculos(v => { const n = [...v]; n[i] = e.target.value; return n })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#072740]">
                          {VEICULOS.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-0.5">Só uma referência — o motorista/veículo de verdade é atribuído depois, em Manifestos.</p>
                      </div>

                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {rota.pontos.map((p, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 w-4 text-right flex-shrink-0">{j + 1}.</span>
                            <span className="text-gray-700 flex-1 truncate">{p.nome}</span>
                            {rotas.length > 1 && (
                              <select
                                value={rota.ordem}
                                onChange={e => moverPonto(p.ponto_id, rota.ordem, +e.target.value)}
                                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 outline-none flex-shrink-0"
                                title="Mover pra outra rota"
                              >
                                {rotas.map(r2 => <option key={r2.ordem} value={r2.ordem}>Rota {r2.ordem}</option>)}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {avisos.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-lg max-h-32 overflow-y-auto">
                  {avisos.map((a, i) => <p key={i} className="text-xs text-gray-500">{a}</p>)}
                </div>
              )}

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

              <button onClick={handleConfirmar} disabled={confirmando}
                className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 btn-brand">
                {confirmando ? 'Salvando…' : `Confirmar e gerar ${rotas.length} manifesto${rotas.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal flutuante de coordenadas manuais */}
      {editandoGeo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditandoGeo(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-xs text-gray-500">Corrigir localização</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{editandoNome}</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Coordenadas *</label>
              <input
                autoFocus
                type="text"
                placeholder="-23.7741, -46.6441"
                value={latInput && lngInput ? `${latInput}, ${lngInput}` : latInput}
                onChange={e => {
                  const v = e.target.value
                  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
                  if (parts.length >= 2) { setLatInput(parts[0]); setLngInput(parts[1]) }
                  else { setLatInput(v); setLngInput('') }
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]"
              />
              <p className="text-[10px] text-gray-400 mt-1">Cole as coordenadas do Google Maps</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">CEP</label>
                <input type="text" placeholder="04872-210" value={cepInput}
                  onChange={e => setCepInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740] font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Município</label>
                <input type="text" placeholder="São Paulo" value={municipioInput}
                  onChange={e => setMunicipioInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Bairro</label>
              <input type="text" placeholder="Borore" value={bairroInput}
                onChange={e => setBairroInput(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => salvarCoordenadas(editandoGeo)}
                disabled={salvandoGeo || !latInput || !lngInput}
                className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 btn-brand"
              >
                {salvandoGeo ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={() => setEditandoGeo(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
