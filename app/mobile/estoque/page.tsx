'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const HOJE = new Date().toISOString().split('T')[0]

type Cliente = { id: string; nome: string }

type DistribuicaoExistente = {
  id: string
  cliente_id: string
  entrada: number
  saida: number
  clientes: { nome: string } | null
}

type Linha = { cliente_id: string; nome: string; quantidade: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseManifesto(texto: string): { numero: number; letra: string } | null {
  const t = texto.trim().replace(/^#/, '')
  const num = parseInt(t)
  if (isNaN(num)) return null
  const letra = t.replace(/\d/g, '').toUpperCase() || 'A'
  return { numero: num, letra }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MobileEstoquePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-sm text-gray-400">Carregando…</p></div>}>
      <EstoqueInner />
    </Suspense>
  )
}

function EstoqueInner() {
  const params   = useSearchParams()
  const router   = useRouter()

  // Auth
  const [autenticado, setAutenticado] = useState<boolean | null>(null)

  // Scanner
  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [scanning,  setScanning]  = useState(false)
  const [scanError, setScanError] = useState('')

  // Manifesto
  const [manifestoTexto, setManifestoTexto]   = useState(params.get('manifesto') ?? '')
  const [manifesto,      setManifesto]         = useState<{ id: string; numero: number; letra: string; totalCaixas: number } | null>(null)
  const [loadingManif,   setLoadingManif]       = useState(false)
  const [erroManif,      setErroManif]          = useState('')

  // Fase
  const [fase, setFase] = useState<'lookup' | 'saida' | 'retorno' | null>(null)

  // Saída — linhas de distribuição
  const [clientes,    setClientes]    = useState<Cliente[]>([])
  const [linhas,      setLinhas]      = useState<Linha[]>([{ cliente_id: '', nome: '', quantidade: 0 }])
  const [salvando,    setSalvando]    = useState(false)
  const [erroSaida,   setErroSaida]   = useState('')
  const [sucesso,     setSucesso]     = useState(false)

  // Retorno
  const [distExist,   setDistExist]   = useState<DistribuicaoExistente[]>([])
  const [qtdesRetorno, setQtdesRetorno] = useState<Record<string, number>>({})
  const [salvandoRet,  setSalvandoRet] = useState(false)
  const [sucessoRet,   setSucessoRet]  = useState(false)

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setAutenticado(true)
    })
  }, [router])

  // ── Carrega clientes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!autenticado) return
    getSupabase().from('clientes').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setClientes((data || []) as Cliente[]))
  }, [autenticado])

  // ── Auto-lookup se veio via URL ───────────────────────────────────────────
  useEffect(() => {
    const m = params.get('manifesto')
    if (m && autenticado) buscarManifesto(m)
  }, [autenticado]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scanner QR ───────────────────────────────────────────────────────────
  async function iniciarScan() {
    setScanError('')
    setScanning(true)
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          const text = result.getText()
          controls.stop()
          setScanning(false)
          // Extrai manifesto da URL ou usa direto
          const url = (() => { try { return new URL(text) } catch { return null } })()
          const val = url ? (url.searchParams.get('manifesto') ?? text) : text
          setManifestoTexto(val)
          buscarManifesto(val)
        }
      })
      controlsRef.current = controls
    } catch {
      setScanError('Não foi possível acessar a câmera.')
      setScanning(false)
    }
  }

  function pararScan() {
    controlsRef.current?.stop()
    setScanning(false)
  }

  // ── Lookup de manifesto ───────────────────────────────────────────────────
  async function buscarManifesto(texto: string) {
    const parsed = parseManifesto(texto)
    if (!parsed) { setErroManif('Formato inválido. Use o número do manifesto, ex: 42A'); return }

    setLoadingManif(true); setErroManif(''); setManifesto(null); setFase(null)
    const sb = getSupabase()

    // 1. Busca manifesto
    const { data: mData } = await sb
      .from('ciclo_manifestos')
      .select('id, numero, letra')
      .eq('numero', parsed.numero)
      .eq('letra', parsed.letra)
      .limit(1)

    if (!mData || !mData[0]) {
      setErroManif(`Manifesto #${texto} não encontrado.`)
      setLoadingManif(false); return
    }
    const mRow = mData[0]

    // 2. Total de caixas via ciclo_pedidos
    const { data: pedidos } = await sb
      .from('ciclo_pedidos')
      .select('qtde_inteira, qtde_fracionada')
      .eq('manifesto_id', mRow.id)

    const totalCaixas = (pedidos || []).reduce((acc: number, p: any) => {
      return acc + (p.qtde_inteira ?? 0) + Math.ceil((p.qtde_fracionada ?? 0) / 12)
    }, 0)

    // 3. Verifica se já tem distribuição
    const { data: dist } = await sb
      .from('estoque_movimentos')
      .select('id, cliente_id, entrada, saida, clientes(nome)')
      .eq('manifesto_id', mRow.id)
      .eq('tipo', 'distribuicao')

    setManifesto({ id: mRow.id, numero: mRow.numero, letra: mRow.letra, totalCaixas })
    setLoadingManif(false)

    if (dist && dist.length > 0) {
      // Fase 2: retorno
      setDistExist(dist as unknown as DistribuicaoExistente[])
      const qtdes: Record<string, number> = {}
      for (const d of dist) qtdes[d.id] = d.saida
      setQtdesRetorno(qtdes)
      setFase('retorno')
    } else {
      // Fase 1: saída
      setLinhas([{ cliente_id: '', nome: '', quantidade: 0 }])
      setFase('saida')
    }
  }

  // ── Salvar saída ──────────────────────────────────────────────────────────
  async function handleSalvarSaida() {
    setErroSaida('')
    const linhasValidas = linhas.filter(l => l.cliente_id && l.quantidade > 0)
    if (linhasValidas.length === 0) { setErroSaida('Adicione ao menos uma cooperativa com quantidade.'); return }

    const totalLancado = linhasValidas.reduce((a, l) => a + l.quantidade, 0)
    if (manifesto && manifesto.totalCaixas > 0 && totalLancado > manifesto.totalCaixas) {
      setErroSaida(`Total (${totalLancado} cx) maior que o manifesto (${manifesto.totalCaixas} cx).`); return
    }

    setSalvando(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const rows = linhasValidas.map(l => ({
      data:         HOJE,
      tipo:         'distribuicao',
      cliente_id:   l.cliente_id,
      manifesto_id: manifesto!.id,
      saida:        l.quantidade,
      entrada:      0,
      created_by:   session?.user.id || null,
    }))
    const { error } = await getSupabase().from('estoque_movimentos').insert(rows)
    setSalvando(false)
    if (error) { setErroSaida(error.message); return }
    setSucesso(true)
  }

  // ── Salvar retorno ────────────────────────────────────────────────────────
  async function handleSalvarRetorno() {
    setSalvandoRet(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const rows = distExist
      .filter(d => (qtdesRetorno[d.id] ?? 0) > 0)
      .map(d => ({
        data:         HOJE,
        tipo:         'retorno',
        cliente_id:   d.cliente_id,
        manifesto_id: manifesto!.id,
        entrada:      qtdesRetorno[d.id],
        saida:        0,
        created_by:   session?.user.id || null,
      }))
    const { error } = await getSupabase().from('estoque_movimentos').insert(rows)
    setSalvandoRet(false)
    if (error) { setErroSaida(error.message); return }
    setSucessoRet(true)
  }

  const totalLinhas   = linhas.reduce((a, l) => a + (l.quantidade || 0), 0)
  const remanescente  = manifesto ? manifesto.totalCaixas - totalLinhas : 0

  // ── Render ────────────────────────────────────────────────────────────────
  if (autenticado === null) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  // Tela de sucesso — saída
  if (sucesso) return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900">Saída registrada!</p>
        <p className="text-sm text-gray-500 mt-1">Manifesto #{manifesto?.numero}{manifesto?.letra} — {totalLinhas} cx distribuídas</p>
      </div>
      <button onClick={() => { setFase('lookup'); setManifesto(null); setManifestoTexto(''); setSucesso(false) }}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm" style={{ background: PRIMARY }}>
        Novo lançamento
      </button>
    </div>
  )

  // Tela de sucesso — retorno
  if (sucessoRet) return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900">Retorno registrado!</p>
        <p className="text-sm text-gray-500 mt-1">Caixas vazias do manifesto #{manifesto?.numero}{manifesto?.letra}</p>
      </div>
      <button onClick={() => { setFase('lookup'); setManifesto(null); setManifestoTexto(''); setSucessoRet(false) }}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm" style={{ background: PRIMARY }}>
        Novo lançamento
      </button>
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-4 pt-10 pb-4" style={{ background: PRIMARY }}>
        <p className="text-xs text-white/60 font-medium tracking-wider uppercase">CooperLiga</p>
        <h1 className="text-xl font-bold text-white mt-0.5">Estoque de Caixas</h1>
      </div>

      <div className="flex-1 px-4 py-6 space-y-6">

        {/* Scanner / busca */}
        {(!manifesto || fase === 'lookup') && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Identificar manifesto</p>

            {scanning ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
                  <video ref={videoRef} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white/70 rounded-xl" />
                  </div>
                </div>
                {scanError && <p className="text-xs text-red-500 text-center">{scanError}</p>}
                <button onClick={pararScan}
                  className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <button onClick={iniciarScan}
                  className="w-full py-4 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                  style={{ background: PRIMARY }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
                    <rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M7 17H3M12 17v4M12 12h4v1"/>
                  </svg>
                  Escanear QR do manifesto
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">ou digite</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manifestoTexto}
                    onChange={e => { setManifestoTexto(e.target.value); setErroManif('') }}
                    placeholder="ex: 42A"
                    className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-[#5C0F0F]"
                  />
                  <button
                    onClick={() => buscarManifesto(manifestoTexto)}
                    disabled={loadingManif}
                    className="px-4 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                    style={{ background: PRIMARY }}>
                    {loadingManif ? '…' : 'Buscar'}
                  </button>
                </div>
                {erroManif && <p className="text-xs text-red-500">{erroManif}</p>}
              </>
            )}
          </div>
        )}

        {/* Fase 1 — Saída */}
        {fase === 'saida' && manifesto && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Distribuição — Fase 1</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                Manifesto #{manifesto.numero}{manifesto.letra}
              </p>
              {manifesto.totalCaixas > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Total do manifesto: <span className="font-semibold">{manifesto.totalCaixas} cx</span>
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Quem está levando as caixas?</p>

              {linhas.map((linha, i) => (
                <div key={i} className="space-y-2">
                  {i > 0 && <div className="h-px bg-gray-100" />}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      {i === 0 ? 'Cooperativa' : `Cooperativa ${i + 1}`}
                    </label>
                    <select
                      value={linha.cliente_id}
                      onChange={e => {
                        const nome = clientes.find(c => c.id === e.target.value)?.nome ?? ''
                        setLinhas(prev => prev.map((l, j) => j === i ? { ...l, cliente_id: e.target.value, nome } : l))
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                      <option value="">Selecione…</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Quantidade (cx)</label>
                      <input
                        type="number" min="1"
                        value={linha.quantidade || ''}
                        onChange={e => setLinhas(prev => prev.map((l, j) => j === i ? { ...l, quantidade: parseInt(e.target.value) || 0 } : l))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
                        placeholder="0"
                      />
                    </div>
                    {i > 0 && (
                      <button onClick={() => setLinhas(prev => prev.filter((_, j) => j !== i))}
                        className="pb-3 text-gray-400 hover:text-red-500">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Remanescente e botão adicionar */}
              {manifesto.totalCaixas > 0 && totalLinhas > 0 && remanescente > 0 && (
                <button
                  onClick={() => setLinhas(prev => [...prev, { cliente_id: '', nome: '', quantidade: remanescente }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Adicionar cooperativa ({remanescente} cx restantes)
                </button>
              )}
              {(manifesto.totalCaixas === 0 || remanescente <= 0) && (
                <button
                  onClick={() => setLinhas(prev => [...prev, { cliente_id: '', nome: '', quantidade: 0 }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Adicionar cooperativa
                </button>
              )}

              {manifesto.totalCaixas > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Lançado: <span className="font-semibold text-gray-800">{totalLinhas} cx</span></span>
                  <span className={remanescente < 0 ? 'text-red-500 font-semibold' : remanescente === 0 ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                    {remanescente < 0 ? `${Math.abs(remanescente)} cx a mais` : remanescente === 0 ? 'Total batido ✓' : `${remanescente} cx restantes`}
                  </span>
                </div>
              )}

              {erroSaida && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{erroSaida}</p>}

              <button onClick={handleSalvarSaida} disabled={salvando}
                className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: PRIMARY }}>
                {salvando ? 'Salvando…' : 'Confirmar saída'}
              </button>

              <button onClick={() => { setFase(null); setManifesto(null); setManifestoTexto('') }}
                className="w-full py-2 text-sm text-gray-400">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Fase 2 — Retorno de vazia */}
        {fase === 'retorno' && manifesto && (
          <div className="space-y-4">
            <div className="bg-teal-50 rounded-2xl p-4">
              <p className="text-xs text-teal-600 font-medium uppercase tracking-wide">Retorno de Vazia — Fase 2</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                Manifesto #{manifesto.numero}{manifesto.letra}
              </p>
              <p className="text-sm text-gray-500 mt-1">Confirme as caixas que estão voltando</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              {distExist.map(d => (
                <div key={d.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">{d.clientes?.nome ?? '—'}</p>
                    <p className="text-xs text-gray-400">saiu {d.saida} cx</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min="0" max={d.saida}
                      value={qtdesRetorno[d.id] ?? d.saida}
                      onChange={e => setQtdesRetorno(prev => ({ ...prev, [d.id]: parseInt(e.target.value) || 0 }))}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
                    />
                    <span className="text-xs text-gray-400">cx retornando</span>
                  </div>
                  {(qtdesRetorno[d.id] ?? d.saida) < d.saida && (
                    <p className="text-xs text-amber-600">
                      {d.saida - (qtdesRetorno[d.id] ?? d.saida)} cx ficaram com a cooperativa
                    </p>
                  )}
                </div>
              ))}

              <button onClick={handleSalvarRetorno} disabled={salvandoRet}
                className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: '#0d9488' }}>
                {salvandoRet ? 'Salvando…' : 'Confirmar retorno'}
              </button>

              <button onClick={() => { setFase(null); setManifesto(null); setManifestoTexto('') }}
                className="w-full py-2 text-sm text-gray-400">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
