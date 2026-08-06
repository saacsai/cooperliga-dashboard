'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { getSupabase } from '@/lib/supabase'

const MapaPontos = dynamic(() => import('@/components/MapaPontos'), { ssr: false })

const PRIMARY = '#5C0F0F'
const WORKER  = 'https://guias.cooperliga.saacs.com.br'

type Tipo = 'estado' | 'municipal'
type Fase = 'upload' | 'pontos' | 'setup' | 'rotas'

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

interface PontoComGeo {
  ponto_id: string
  codigo: string
  nome: string
  endereco: string
  lat?: number
  lng?: number
  qtde_caixas: number
  geo_status?: string
  produto?: string
  diretoria?: string
}

interface RotaSugerida {
  ordem: number
  veiculo_sugerido: string
  total_entregas: number
  total_caixas: number
  pontos: Array<{ponto_id: string; nome: string; ordem: number; qtde_caixas: number}>
}

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

export default function RoteirizacaoPage() {
  const [fase,      setFase]     = useState<Fase>('upload')
  const [tipo,      setTipo]     = useState<Tipo>('municipal')
  const [arquivo,   setArquivo]  = useState<File | null>(null)
  const [carregando, setCarreg]  = useState(false)
  const [erro,      setErro]     = useState('')
  const [avisos,    setAvisos]   = useState<string[]>([])

  // Fase pontos
  const [pontosExt, setPontosExt]   = useState<PontoExtraido[]>([])
  const [pontosGeo, setPontosGeo]   = useState<PontoComGeo[]>([])
  const [geocodando, setGeocodando] = useState(false)
  const [regiao,    setRegiao]      = useState('')

  // Fase setup
  const [numProd,    setNumProd]   = useState(1)
  const [cargaDobr, setCargaDobr] = useState(false)
  const [maxEntregas, setMaxEnt]  = useState(25)
  const [dataCiclo,   setDataCiclo] = useState('')

  // Fase rotas
  const [rotas,      setRotas]    = useState<RotaSugerida[]>([])
  const [veiculos,   setVeiculos] = useState<string[]>([])
  const [confirmando, setConf]    = useState(false)
  const [confirmado,  setConfirm] = useState(false)

  // Mapa
  const [mostraMapa, setMostraMapa] = useState(false)

  // Coordenadas manuais
  const [editandoGeo, setEditandoGeo] = useState<string | null>(null) // ponto_id
  const [latInput,    setLatInput]    = useState('')
  const [lngInput,    setLngInput]    = useState('')
  const [salvandoGeo, setSalvandoGeo] = useState(false)

  // ── Passo 1: upload e extração ──────────────────────────────────────────────
  async function handleExtrair() {
    if (!arquivo) { setErro('Selecione um arquivo'); return }
    setCarreg(true); setErro(''); setAvisos([])
    try {
      const fd  = new FormData()
      const url = tipo === 'municipal'
        ? `${WORKER}/extrair-prefeitura`
        : `${WORKER}/extrair-estado`
      fd.append(tipo === 'municipal' ? 'xls' : 'zip_grs', arquivo)

      const res  = await fetch(url, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || JSON.stringify(json))

      const pontos: PontoExtraido[] = json.pontos || []
      setPontosExt(pontos)
      setAvisos(json.avisos || [])

      // detectar região automaticamente
      const dirs = new Set(pontos.map(p => p.diretoria).filter(Boolean))
      if (dirs.size === 1) setRegiao(Array.from(dirs)[0] as string)

      await enriquecerComGeo(pontos)
      setFase('pontos')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao extrair')
    } finally {
      setCarreg(false)
    }
  }

  async function enriquecerComGeo(pontos: PontoExtraido[]) {
    const sb = getSupabase()
    const resultado: PontoComGeo[] = []

    for (const p of pontos) {
      const codigo = p.codigo_prefeitura || p.cie || ''
      const col    = p.codigo_prefeitura ? 'codigo_prefeitura' : 'codigo_estado'
      const nome   = p.nome || p.nome_escola || `Ponto ${codigo}`
      const qtde   = tipo === 'municipal'
        ? (p.qtde_inteira || 0) + Math.ceil((p.qtde_fracionada || 0) / 12)
        : Math.ceil((p.quantidade || 0) / 144)

      const { data } = await sb
        .from('pontos_de_entrega')
        .select('id, lat, lng, geo_status')
        .eq(col, codigo)
        .limit(1)
        .single()

      if (data) {
        resultado.push({
          ponto_id: data.id,
          codigo,
          nome,
          endereco: p.endereco || '',
          lat: data.lat ?? undefined,
          lng: data.lng ?? undefined,
          qtde_caixas: qtde,
          geo_status: data.geo_status || 'pendente',
          produto: p.produto,
          diretoria: p.diretoria,
        })
      } else {
        // Ponto não existe — registrar automaticamente
        const { data: novo } = await sb
          .from('pontos_de_entrega')
          .insert({
            nome,
            endereco:          p.endereco          || null,
            municipio:         p.municipio         || null,
            cep:               p.cep               || null,
            codigo_prefeitura: p.codigo_prefeitura || null,
            codigo_estado:     p.cie               || null,
            geo_status: 'pendente',
          })
          .select('id')
          .single()

        resultado.push({
          ponto_id: novo?.id || '',
          codigo,
          nome,
          endereco: p.endereco || '',
          qtde_caixas: qtde,
          geo_status: 'pendente',
          produto: p.produto,
          diretoria: p.diretoria,
        })
      }
    }
    setPontosGeo(resultado)
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
      // recarregar geo dos pontos atualizados
      await enriquecerComGeo(pontosExt)
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
      // Limpa coords atuais para forçar reprocessamento
      const sb = getSupabase()
      await sb.from('pontos_de_entrega')
        .update({ lat: null, lng: null, geo_status: 'pendente' })
        .eq('id', pontoId)
      await fetch('/api/geocodificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [pontoId] }),
      })
      await enriquecerComGeo(pontosExt)
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
      await sb.from('pontos_de_entrega')
        .update({ lat, lng, geo_status: 'ok' })
        .eq('id', pontoId)
      await enriquecerComGeo(pontosExt)
      setEditandoGeo(null)
      setLatInput('')
      setLngInput('')
    } finally {
      setSalvandoGeo(false)
    }
  }

  // ── Passo 3: calcular rotas ─────────────────────────────────────────────────
  async function handleCalcular() {
    setCarreg(true); setErro('')
    try {
      const payload = {
        pontos: pontosGeo
          .filter(p => p.ponto_id && p.lat && p.lng)
          .map(p => ({
            ponto_id:    p.ponto_id,
            lat:         p.lat,
            lng:         p.lng,
            qtde_caixas: p.qtde_caixas,
            nome:        p.nome,
          })),
        num_produtos:  numProd,
        carga_dobrada: cargaDobr,
        max_entregas:  maxEntregas,
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

  // ── Passo 4: confirmar e salvar ─────────────────────────────────────────────
  async function handleConfirmar() {
    if (!regiao) { setErro('Informe a região antes de confirmar'); return }
    setConf(true); setErro('')
    const sb = getSupabase()

    try {
      const { data: sess, error: errSess } = await sb
        .from('roteirizacao_sessoes')
        .insert({
          regiao,
          tipo_gr:       tipo === 'municipal' ? 'municipal' : 'estado',
          num_produtos:  numProd,
          carga_dobrada: cargaDobr,
          max_entregas:  maxEntregas,
          data_ciclo:    dataCiclo || null,
          status:        'confirmado',
        })
        .select('id')
        .single()

      if (errSess || !sess) throw new Error(errSess?.message || 'Erro ao criar sessão')

      for (let i = 0; i < rotas.length; i++) {
        const rota = rotas[i]
        const { data: rotaRow, error: errR } = await sb
          .from('roteirizacao_rotas')
          .insert({
            sessao_id:     sess.id,
            ordem:         rota.ordem,
            veiculo_tipo:  veiculos[i] || rota.veiculo_sugerido,
            total_entregas: rota.total_entregas,
            total_caixas:  rota.total_caixas,
          })
          .select('id')
          .single()

        if (errR || !rotaRow) continue

        const pontoRows = rota.pontos.map((p, j) => ({
          rota_id:     rotaRow.id,
          ponto_id:    p.ponto_id,
          ordem:       j + 1,
          qtde_caixas: p.qtde_caixas,
        }))
        await sb.from('roteirizacao_pontos').insert(pontoRows)
      }

      setConfirm(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao confirmar')
    } finally {
      setConf(false)
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
          <h2 className="text-lg font-bold text-gray-900 mb-2">Roteirização confirmada</h2>
          <p className="text-sm text-gray-500 mb-6">
            {rotas.length} rota{rotas.length !== 1 ? 's' : ''} salva{rotas.length !== 1 ? 's' : ''} na sessão.
          </p>
          <button onClick={() => { setFase('upload'); setConfirm(false); setRotas([]); setPontosExt([]); setPontosGeo([]); setArquivo(null) }}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: PRIMARY }}>
            Nova roteirização
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl pt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Roteirização</h1>
      <p className="text-sm text-gray-500 mb-6">Gera sugestão de rotas a partir das GRs do ciclo</p>

      {/* ── Passo 1: Upload ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <PassoHeader n={1} label="Upload das GRs" ativo={fase === 'upload'} />

        {fase === 'upload' ? (
          <>
            <div className="flex gap-2 mb-5">
              {(['municipal', 'estado'] as Tipo[]).map(t => (
                <button key={t} onClick={() => { setTipo(t); setArquivo(null) }}
                  className="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
                  style={{ background: tipo === t ? PRIMARY : '#FAF5F5', color: tipo === t ? '#fff' : '#6b7280', borderColor: tipo === t ? PRIMARY : '#e5e7eb' }}>
                  {t === 'municipal' ? 'Prefeitura (XLSX)' : 'Estado (ZIP de PDFs)'}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">
                {tipo === 'municipal' ? 'Planilha XLSX de solicitação' : 'ZIP com todos os PDFs das GRs'}
              </p>
              <label htmlFor="roteir-file"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer"
                style={{ background: PRIMARY }}>
                {arquivo ? arquivo.name : 'Selecionar arquivo'}
                <input
                  id="roteir-file"
                  type="file"
                  accept={tipo === 'municipal' ? '.xlsx,.xls' : '.zip'}
                  className="sr-only"
                  onChange={e => setArquivo(e.target.files?.[0] || null)}
                />
              </label>
              {arquivo && (
                <button type="button" onClick={() => setArquivo(null)}
                  className="ml-2 text-xs text-gray-400 hover:text-red-500">trocar</button>
              )}
            </div>

            {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

            <button onClick={handleExtrair} disabled={carregando || !arquivo}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: PRIMARY }}>
              {carregando ? 'Extraindo…' : 'Extrair pontos'}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="font-medium">{pontosGeo.length} pontos extraídos</span>
            <span className="text-gray-300">·</span>
            <button onClick={() => setFase('upload')} className="text-xs underline" style={{ color: PRIMARY }}>
              Alterar arquivo
            </button>
          </div>
        )}
      </div>

      {/* ── Passo 2: Pontos ── */}
      {fase !== 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <PassoHeader n={2} label="Conferência dos pontos" ativo={fase === 'pontos'} />

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
                  <span>Código</span><span>Nome</span><span>Qtde cx</span><span>Geo</span><span></span>
                </div>
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {pontosGeo.map((p, i) => (
                    <div key={i}>
                      <div className="grid grid-cols-[1fr_2fr_1fr_auto_auto] px-3 py-2 gap-2 text-xs items-center">
                        <span className="text-gray-500 font-mono">{p.codigo}</span>
                        <span className="text-gray-800 truncate">{p.nome}</span>
                        <span className="text-gray-700">{p.qtde_caixas}</span>
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
                              onClick={() => { setEditandoGeo(p.ponto_id); setLatInput(''); setLngInput('') }}
                              className="text-[10px] text-gray-300 hover:text-gray-500 leading-none"
                              title="Corrigir coordenadas manualmente"
                            >✎</button>
                          </div>
                        )}
                      </div>
                      {editandoGeo === p.ponto_id && (
                        <div className="px-3 pb-2 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Cole as coordenadas ex: -23.7414, -46.6695"
                            value={latInput}
                            onChange={e => {
                              const v = e.target.value
                              const parts = v.split(',').map(s => s.trim()).filter(Boolean)
                              if (parts.length === 2) { setLatInput(parts[0]); setLngInput(parts[1]) }
                              else { setLatInput(v); setLngInput('') }
                            }}
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-[#5C0F0F]"
                          />
                          <button onClick={() => salvarCoordenadas(p.ponto_id)} disabled={salvandoGeo || !latInput || !lngInput}
                            className="flex-shrink-0 text-xs px-2 py-1 rounded text-white disabled:opacity-50" style={{ background: PRIMARY }}>
                            {salvandoGeo ? '…' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditandoGeo(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                      )}
                    </div>
                  ))}
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
                            {editandoGeo !== p.ponto_id && (
                              <button
                                onClick={() => { setEditandoGeo(p.ponto_id); setLatInput(''); setLngInput('') }}
                                className="flex-shrink-0 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                              >
                                Inserir coords
                              </button>
                            )}
                          </div>
                          {editandoGeo === p.ponto_id && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Cole as coordenadas do Google Maps ex: -23.7414, -46.6695"
                                value={latInput}
                                onChange={e => {
                                  const v = e.target.value
                                  // Se contiver vírgula entre dois números, separar automaticamente
                                  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
                                  if (parts.length === 2) {
                                    setLatInput(parts[0])
                                    setLngInput(parts[1])
                                  } else {
                                    setLatInput(v)
                                    setLngInput('')
                                  }
                                }}
                                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-[#5C0F0F]"
                              />
                              <button
                                onClick={() => salvarCoordenadas(p.ponto_id)}
                                disabled={salvandoGeo || !latInput || !lngInput}
                                className="flex-shrink-0 text-xs px-2 py-1 rounded text-white disabled:opacity-50"
                                style={{ background: PRIMARY }}
                              >
                                {salvandoGeo ? '…' : 'Salvar'}
                              </button>
                              <button
                                onClick={() => setEditandoGeo(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                ✕
                              </button>
                            </div>
                          )}
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
                            qtde_caixas: p.qtde_caixas,
                          }))}
                        onRegeocodificar={regeocodificar}
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

              <button onClick={() => setFase('setup')}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: PRIMARY }}>
                Continuar para configuração
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">{comGeo} com geo · {semGeo} sem geo</p>
          )}
        </div>
      )}

      {/* ── Passo 3: Setup ── */}
      {(fase === 'setup' || fase === 'rotas') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <PassoHeader n={3} label="Parâmetros da operação" ativo={fase === 'setup'} />

          {fase === 'setup' ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Região / Diretoria</label>
                  <input type="text" value={regiao} onChange={e => setRegiao(e.target.value)}
                    placeholder="Ex: SUL 2 ou VILA YOLANDA II"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ciclo (DDMM)</label>
                  <input type="text" value={dataCiclo} onChange={e => setDataCiclo(e.target.value)} maxLength={4}
                    placeholder="0603"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantos produtos?</label>
                  <input type="number" min={1} max={6} value={numProd} onChange={e => setNumProd(+e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Fator de tempo: {(1 + (numProd - 1) * 0.25).toFixed(2)}×</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Máx. entregas / motorista</label>
                  <input type="number" min={5} max={50} value={maxEntregas} onChange={e => setMaxEnt(+e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Efetivas: {Math.floor(maxEntregas / (1 + (numProd - 1) * 0.25))} entregas</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Carga dobrada?</label>
                  <div className="flex gap-3 mt-2.5">
                    {[false, true].map(v => (
                      <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="carga" checked={cargaDobr === v} onChange={() => setCargaDobr(v)}
                          className="accent-[#5C0F0F]" />
                        <span className="text-sm text-gray-700">{v ? 'Sim' : 'Não'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

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

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

              <button onClick={handleCalcular} disabled={carregando}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: PRIMARY }}>
                {carregando ? 'Calculando…' : 'Gerar sugestão de rotas'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{numProd} produto{numProd !== 1 ? 's' : ''} · {maxEntregas} entregas/motorista{cargaDobr ? ' · carga dobrada' : ''}</span>
              <button onClick={() => { setFase('setup'); setRotas([]) }} className="text-xs underline" style={{ color: PRIMARY }}>
                Alterar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Passo 4: Rotas ── */}
      {fase === 'rotas' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <PassoHeader n={4} label="Ajuste e confirmação das rotas" ativo />

          {rotas.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma rota sugerida. Verifique os dados e tente novamente.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {rotas.map((rota, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Rota {rota.ordem}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{rota.total_entregas} entregas · {rota.total_caixas} cx</span>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Veículo</label>
                      <select value={veiculos[i] || rota.veiculo_sugerido}
                        onChange={e => setVeiculos(v => { const n = [...v]; n[i] = e.target.value; return n })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C0F0F]">
                        {VEICULOS.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {rota.pontos.map((p, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 w-4 text-right flex-shrink-0">{j + 1}.</span>
                          <span className="text-gray-700 flex-1 truncate">{p.nome}</span>
                          <span className="text-gray-400 flex-shrink-0">{p.qtde_caixas}cx</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {avisos.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-lg max-h-32 overflow-y-auto">
                  {avisos.map((a, i) => <p key={i} className="text-xs text-gray-500">{a}</p>)}
                </div>
              )}

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-4">{erro}</p>}

              <button onClick={handleConfirmar} disabled={confirmando}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: PRIMARY }}>
                {confirmando ? 'Salvando…' : `Confirmar ${rotas.length} rota${rotas.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
