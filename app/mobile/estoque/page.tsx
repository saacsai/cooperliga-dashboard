'use client'

import { Suspense, useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const HOJE = new Date().toISOString().split('T')[0]

type Cliente = { id: string; nome: string }
type Tela = 'hub' | 'manifesto' | 'receber' | 'ajuste' | 'extrato' | 'venda' | 'retirada'
type DistribuicaoExistente = {
  id: string; cliente_id: string; entrada: number; saida: number
  clientes: { nome: string } | null
}
type Linha = { cliente_id: string; nome: string; quantidade: number }
type Movimento = {
  id: string; data: string; tipo: string; cliente_id: string | null
  entrada: number; saida: number; observacao: string | null
  clientes: { nome: string } | null
  ciclo_manifestos: { numero_base: number; letra: string } | null
}

const TIPO_LABEL: Record<string, string> = {
  recebimento: 'Recebimento', distribuicao: 'Distribuição',
  retorno: 'Retorno Vazia', retirada: 'Retirada',
  venda: 'Venda', ajuste: 'Ajuste',
}
const TIPO_COR: Record<string, string> = {
  recebimento: 'text-green-700 bg-green-50', distribuicao: 'text-blue-700 bg-blue-50',
  retorno: 'text-teal-700 bg-teal-50', retirada: 'text-purple-700 bg-purple-50',
  venda: 'text-orange-700 bg-orange-50', ajuste: 'text-gray-700 bg-gray-100',
}

function parseManifesto(texto: string): { numero: number; letra: string } | null {
  const t = texto.trim().replace(/^#/, '')
  const num = parseInt(t)
  if (isNaN(num)) return null
  return { numero: num, letra: t.replace(/\d/g, '').toUpperCase() || 'A' }
}

export default function MobileEstoquePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-sm text-gray-400">Carregando…</p></div>}>
      <EstoqueInner />
    </Suspense>
  )
}

function EstoqueInner() {
  const params = useSearchParams()
  const router = useRouter()

  const [autenticado, setAutenticado] = useState<boolean | null>(null)
  const [tela, setTela] = useState<Tela>('hub')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [saldoGalpao, setSaldoGalpao] = useState<number | null>(null)

  // ── manifesto ──────────────────────────────────────────────────────────────
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [scanning,  setScanning]  = useState(false)
  const [scanError, setScanError] = useState('')
  const [manifestoTexto, setManifestoTexto] = useState(params.get('manifesto') ?? '')
  const [manifesto, setManifesto] = useState<{ id: string; numero: number; letra: string; totalCaixas: number } | null>(null)
  const [loadingManif, setLoadingManif] = useState(false)
  const [erroManif,    setErroManif]    = useState('')
  const [fase, setFase] = useState<'saida' | 'retorno' | null>(null)
  const [linhas,    setLinhas]    = useState<Linha[]>([{ cliente_id: '', nome: '', quantidade: 0 }])
  const [salvando,  setSalvando]  = useState(false)
  const [erroSaida, setErroSaida] = useState('')
  const [sucesso,   setSucesso]   = useState(false)
  const [distExist,      setDistExist]      = useState<DistribuicaoExistente[]>([])
  const [qtdesRetorno,   setQtdesRetorno]   = useState<Record<string, number>>({})
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [salvandoRet, setSalvandoRet] = useState(false)
  const [erroRetorno, setErroRetorno] = useState('')
  const [sucessoRet,  setSucessoRet]  = useState(false)

  // ── recebimento ────────────────────────────────────────────────────────────
  const [recForm,     setRecForm]     = useState({ cliente_id: '', quantidade: '', data: HOJE, observacao: '' })
  const [salvandoRec, setSalvandoRec] = useState(false)
  const [erroRec,     setErroRec]     = useState('')
  const [sucessoRec,  setSucessoRec]  = useState(false)

  // ── venda / retirada (saída simples sem manifesto) ────────────────────────
  const [saidaForm,     setSaidaForm]     = useState({ cliente_id: '', quantidade: '', data: HOJE, observacao: '' })
  const [salvandoSaida, setSalvandoSaida] = useState(false)
  const [erroSaidaSimp, setErroSaidaSimp] = useState('')
  const [sucessoSaida,  setSucessoSaida]  = useState(false)

  // ── ajuste ─────────────────────────────────────────────────────────────────
  const [ajForm,     setAjForm]     = useState({ cliente_id: '', quantidade: '', direcao: 'entrada' as 'entrada' | 'saida', data: HOJE, observacao: '' })
  const [salvandoAj, setSalvandoAj] = useState(false)
  const [erroAj,     setErroAj]     = useState('')
  const [sucessoAj,  setSucessoAj]  = useState(false)

  // ── extrato ────────────────────────────────────────────────────────────────
  const [movimentos,       setMovimentos]       = useState<Movimento[]>([])
  const [loadingExt,       setLoadingExt]       = useState(false)
  const [filtroExtCliente, setFiltroExtCliente] = useState('')

  // ── auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        router.replace(`/login?next=${next}`)
      } else setAutenticado(true)
    })
  }, [router])

  useEffect(() => {
    if (!autenticado) return
    Promise.all([
      getSupabase().from('clientes').select('id, nome').eq('ativo', true).order('nome'),
      getSupabase().from('estoque_movimentos').select('entrada, saida'),
    ]).then(([{ data: cli }, { data: mov }]) => {
      setClientes((cli || []) as Cliente[])
      setSaldoGalpao((mov || []).reduce((a: number, m: any) => a + m.entrada - m.saida, 0))
    })
  }, [autenticado])

  useEffect(() => {
    const m = params.get('manifesto')
    if (m && autenticado) { setTela('manifesto'); buscarManifesto(m) }
  }, [autenticado]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await getSupabase().auth.signOut()
    router.replace('/login')
  }

  // ── scanner ────────────────────────────────────────────────────────────────
  async function iniciarScan() {
    setScanError(''); setScanning(true)
    await new Promise(r => setTimeout(r, 100))
    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) {
          const text = result.getText()
          controls.stop(); setScanning(false)
          const url = (() => { try { return new URL(text) } catch { return null } })()
          const val = url ? (url.searchParams.get('manifesto') ?? text) : text
          setManifestoTexto(val); buscarManifesto(val)
        }
      })
      controlsRef.current = controls
    } catch { setScanError('Não foi possível acessar a câmera.'); setScanning(false) }
  }

  function pararScan() { controlsRef.current?.stop(); setScanning(false) }

  // ── buscar manifesto ───────────────────────────────────────────────────────
  async function buscarManifesto(texto: string) {
    const parsed = parseManifesto(texto)
    if (!parsed) { setErroManif('Formato inválido. Use o número do manifesto, ex: 42A'); return }
    setLoadingManif(true); setErroManif(''); setManifesto(null); setFase(null)
    const sb = getSupabase()
    const letraExplicita = texto.trim().replace(/^#/, '').replace(/\d/g, '').length > 0
    let q = sb.from('ciclo_manifestos').select('id, numero_base, letra').eq('numero_base', parsed.numero)
    if (letraExplicita) q = q.eq('letra', parsed.letra)
    const { data: mData } = await q.order('letra').limit(1)
    if (!mData?.[0]) { setErroManif(`Manifesto #${texto} não encontrado.`); setLoadingManif(false); return }
    const mRow = mData[0] as { id: string; numero_base: number; letra: string }
    const { data: pedidos } = await sb.from('ciclo_pedidos').select('qtde_inteira, qtde_fracionada').eq('manifesto_id', mRow.id)
    const totalInteiras = (pedidos || []).reduce((a: number, p: any) => a + (p.qtde_inteira ?? 0), 0)
    const totalPacotes  = (pedidos || []).reduce((a: number, p: any) => a + (p.qtde_fracionada ?? 0), 0)
    const totalCaixas   = totalInteiras + Math.floor(totalPacotes / 12 + 0.6)
    const { data: dist } = await sb.from('estoque_movimentos')
      .select('id, cliente_id, entrada, saida, clientes(nome)')
      .eq('manifesto_id', mRow.id).eq('tipo', 'distribuicao')
    setManifesto({ id: mRow.id, numero: mRow.numero_base, letra: mRow.letra, totalCaixas })
    setLoadingManif(false)
    if (dist && dist.length > 0) {
      setDistExist(dist as unknown as DistribuicaoExistente[])
      const qtdes: Record<string, number> = {}
      for (const d of dist) qtdes[d.id] = d.saida
      setQtdesRetorno(qtdes); setFase('retorno')
    } else { setLinhas([{ cliente_id: '', nome: '', quantidade: 0 }]); setFase('saida') }
  }

  // ── salvar saída ───────────────────────────────────────────────────────────
  async function handleSalvarSaida() {
    setErroSaida('')
    const validas = linhas.filter(l => l.cliente_id && l.quantidade > 0)
    if (!validas.length) { setErroSaida('Adicione ao menos uma cooperativa com quantidade.'); return }
    const total = validas.reduce((a, l) => a + l.quantidade, 0)
    if (manifesto && manifesto.totalCaixas > 0 && total > manifesto.totalCaixas) {
      setErroSaida(`Total (${total} cx) maior que o manifesto (${manifesto.totalCaixas} cx).`); return
    }
    setSalvando(true)
    const sb = getSupabase()
    for (const l of validas) {
      const { data: movs } = await sb.from('estoque_movimentos').select('entrada, saida').eq('cliente_id', l.cliente_id)
      const saldo = (movs || []).reduce((a: number, m: any) => a + m.entrada - m.saida, 0)
      if (l.quantidade > saldo) {
        const nome = clientes.find(c => c.id === l.cliente_id)?.nome ?? 'cliente'
        setErroSaida(`Saldo insuficiente: ${nome} tem ${saldo} cx disponíveis.`)
        setSalvando(false); return
      }
    }
    const { data: { session } } = await sb.auth.getSession()
    const rows = validas.map(l => ({
      data: HOJE, tipo: 'distribuicao', cliente_id: l.cliente_id,
      manifesto_id: manifesto!.id, saida: l.quantidade, entrada: 0,
      created_by: session?.user.id || null,
    }))
    const { error } = await sb.from('estoque_movimentos').insert(rows)
    setSalvando(false)
    if (error) { setErroSaida(error.message); return }
    setSaldoGalpao(p => p !== null ? p - total : null); setSucesso(true)
  }

  // ── salvar retorno ─────────────────────────────────────────────────────────
  async function handleSalvarRetorno() {
    setErroRetorno('')
    for (const d of distExist) {
      const qtd  = qtdesRetorno[d.id] ?? d.saida
      const falta = d.saida - qtd
      if (falta > 0 && !justificativas[d.id]?.trim()) {
        setErroRetorno(`Justificativa obrigatória: ${d.clientes?.nome ?? 'cooperativa'} tem ${falta} cx sem retorno.`); return
      }
    }
    setSalvandoRet(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const rows = distExist.filter(d => (qtdesRetorno[d.id] ?? d.saida) > 0).map(d => {
      const qtd   = qtdesRetorno[d.id] ?? d.saida
      const falta = d.saida - qtd
      return {
        data: HOJE, tipo: 'retorno', cliente_id: d.cliente_id,
        manifesto_id: manifesto!.id, entrada: qtd, saida: 0,
        observacao: falta > 0 ? `${falta} cx não retornaram: ${justificativas[d.id]}` : null,
        created_by: session?.user.id || null,
      }
    })
    const { error } = await getSupabase().from('estoque_movimentos').insert(rows)
    setSalvandoRet(false)
    if (error) { setErroRetorno(error.message); return }
    setSaldoGalpao(p => p !== null ? p + rows.reduce((a, r) => a + r.entrada, 0) : null)
    setSucessoRet(true)
  }

  // ── salvar recebimento ─────────────────────────────────────────────────────
  async function handleSalvarRecebimento() {
    setErroRec('')
    const qty = parseInt(recForm.quantidade) || 0
    if (!recForm.cliente_id) { setErroRec('Selecione o cliente.'); return }
    if (qty <= 0) { setErroRec('Quantidade deve ser maior que zero.'); return }
    if (recForm.data > HOJE) { setErroRec('Data não pode ser futura.'); return }
    setSalvandoRec(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const { error } = await getSupabase().from('estoque_movimentos').insert({
      data: recForm.data, tipo: 'recebimento', cliente_id: recForm.cliente_id,
      entrada: qty, saida: 0, observacao: recForm.observacao || null,
      created_by: session?.user.id || null,
    })
    setSalvandoRec(false)
    if (error) { setErroRec(error.message); return }
    setSaldoGalpao(p => p !== null ? p + qty : null); setSucessoRec(true)
  }

  // ── salvar venda / retirada ────────────────────────────────────────────────
  async function handleSalvarSaidaSimples(tipo: 'venda' | 'retirada') {
    setErroSaidaSimp('')
    const qty = parseInt(saidaForm.quantidade) || 0
    if (!saidaForm.cliente_id) { setErroSaidaSimp('Selecione o cliente.'); return }
    if (qty <= 0) { setErroSaidaSimp('Quantidade deve ser maior que zero.'); return }
    if (saidaForm.data > HOJE) { setErroSaidaSimp('Data não pode ser futura.'); return }
    const { data: movs } = await getSupabase().from('estoque_movimentos').select('entrada, saida').eq('cliente_id', saidaForm.cliente_id)
    const saldo = (movs || []).reduce((a: number, m: any) => a + m.entrada - m.saida, 0)
    if (qty > saldo) {
      const nome = clientes.find(c => c.id === saidaForm.cliente_id)?.nome ?? 'cliente'
      setErroSaidaSimp(`Saldo insuficiente: ${nome} tem ${saldo} cx disponíveis.`); return
    }
    setSalvandoSaida(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const { error } = await getSupabase().from('estoque_movimentos').insert({
      data: saidaForm.data, tipo, cliente_id: saidaForm.cliente_id,
      entrada: 0, saida: qty, observacao: saidaForm.observacao || null,
      created_by: session?.user.id || null,
    })
    setSalvandoSaida(false)
    if (error) { setErroSaidaSimp(error.message); return }
    setSaldoGalpao(p => p !== null ? p - qty : null); setSucessoSaida(true)
  }

  // ── salvar ajuste ──────────────────────────────────────────────────────────
  async function handleSalvarAjuste() {
    setErroAj('')
    const qty = parseInt(ajForm.quantidade) || 0
    if (!ajForm.cliente_id) { setErroAj('Selecione o cliente.'); return }
    if (qty <= 0) { setErroAj('Quantidade deve ser maior que zero.'); return }
    if (ajForm.data > HOJE) { setErroAj('Data não pode ser futura.'); return }
    if (!ajForm.observacao.trim()) { setErroAj('Motivo do ajuste é obrigatório.'); return }
    setSalvandoAj(true)
    const { data: { session } } = await getSupabase().auth.getSession()
    const { error } = await getSupabase().from('estoque_movimentos').insert({
      data: ajForm.data, tipo: 'ajuste', cliente_id: ajForm.cliente_id,
      entrada: ajForm.direcao === 'entrada' ? qty : 0,
      saida:   ajForm.direcao === 'saida'   ? qty : 0,
      observacao: ajForm.observacao, created_by: session?.user.id || null,
    })
    setSalvandoAj(false)
    if (error) { setErroAj(error.message); return }
    const delta = ajForm.direcao === 'entrada' ? qty : -qty
    setSaldoGalpao(p => p !== null ? p + delta : null); setSucessoAj(true)
  }

  // ── carregar extrato ───────────────────────────────────────────────────────
  async function carregarExtrato() {
    setLoadingExt(true)
    const { data } = await getSupabase()
      .from('estoque_movimentos')
      .select('id, data, tipo, cliente_id, entrada, saida, observacao, clientes(nome), ciclo_manifestos(numero_base, letra)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    setMovimentos((data || []) as unknown as Movimento[])
    setLoadingExt(false)
  }

  // ── voltar ao hub ──────────────────────────────────────────────────────────
  function voltarHub() {
    pararScan(); setTela('hub')
    setFase(null); setManifesto(null); setManifestoTexto(''); setErroManif('')
    setErroSaida(''); setErroRetorno(''); setSucesso(false); setSucessoRet(false)
    setLinhas([{ cliente_id: '', nome: '', quantidade: 0 }])
  }

  const totalLinhas  = linhas.reduce((a, l) => a + (l.quantidade || 0), 0)
  const remanescente = manifesto ? manifesto.totalCaixas - totalLinhas : 0

  const extratofiltrado = useMemo(() =>
    filtroExtCliente ? movimentos.filter(m => m.cliente_id === filtroExtCliente) : movimentos,
    [movimentos, filtroExtCliente]
  )

  const saldoPorCliente = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of movimentos) {
      if (!m.cliente_id) continue
      map[m.cliente_id] = (map[m.cliente_id] ?? 0) + m.entrada - m.saida
    }
    return map
  }, [movimentos])

  if (autenticado === null) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  // ── Header ─────────────────────────────────────────────────────────────────
  function Header({ titulo, onBack }: { titulo: string; onBack?: () => void }) {
    return (
      <div className="px-4 pt-10 pb-4 flex items-center justify-between" style={{ background: PRIMARY }}>
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="text-white/70 hover:text-white -ml-1 p-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div>
            <Image src="/logo_fonte.jpg" alt="CooperLiga" width={130} height={24} className="object-contain" priority />
            {titulo !== 'Estoque de Caixas' && (
              <p className="text-xs text-white/70 mt-0.5">{titulo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saldoGalpao !== null && (
            <div className="text-right">
              <p className="text-[10px] text-white/50">Galpão</p>
              <p className="text-sm font-bold text-white">{saldoGalpao} cx</p>
            </div>
          )}
          {!onBack && (
            <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Tela sucesso genérica ──────────────────────────────────────────────────
  function Sucesso({ titulo, subtitulo, cor, onNovo, labelNovo }: {
    titulo: string; subtitulo: string; cor: string
    onNovo: () => void; labelNovo: string
  }) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-6">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${cor}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{titulo}</p>
          <p className="text-sm text-gray-500 mt-1">{subtitulo}</p>
        </div>
        <button onClick={voltarHub} className="w-full py-3 rounded-xl text-white font-semibold text-sm" style={{ background: PRIMARY }}>
          Voltar ao início
        </button>
        <button onClick={onNovo} className="text-sm text-gray-400">{labelNovo}</button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUB
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'hub') {
    const acoes = [
      {
        id: 'manifesto', titulo: 'Manifesto', descricao: 'Distribuição e retorno de caixas',
        cor: 'bg-blue-50 text-blue-600', borda: 'border-blue-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
            <rect x="3" y="16" width="5" height="5" rx="1"/>
            <path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M7 17H3M12 17v4M12 12h4v1"/>
          </svg>
        ),
      },
      {
        id: 'receber', titulo: 'Recebimento', descricao: 'Entrada de caixas no galpão',
        cor: 'bg-green-50 text-green-600', borda: 'border-green-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        ),
      },
      {
        id: 'ajuste', titulo: 'Ajuste', descricao: 'Corrigir saldo do estoque',
        cor: 'bg-amber-50 text-amber-600', borda: 'border-amber-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="16"/>
          </svg>
        ),
      },
      {
        id: 'extrato', titulo: 'Extrato', descricao: 'Histórico e saldo por cliente',
        cor: 'bg-purple-50 text-purple-600', borda: 'border-purple-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        ),
      },
      {
        id: 'venda', titulo: 'Venda', descricao: 'Registrar venda de caixas',
        cor: 'bg-orange-50 text-orange-600', borda: 'border-orange-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        ),
      },
      {
        id: 'retirada', titulo: 'Retirada', descricao: 'Cooperativa leva caixas vazias',
        cor: 'bg-pink-50 text-pink-600', borda: 'border-pink-100',
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        ),
      },
    ]
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Estoque de Caixas" />
        <div className="flex-1 px-4 py-6">
          <div className="grid grid-cols-2 gap-3">
            {acoes.map(a => (
              <button key={a.id}
                onClick={() => {
                  if (a.id === 'extrato') carregarExtrato()
                  setTela(a.id as Tela)
                }}
                className={`bg-white rounded-2xl border p-5 text-left shadow-sm active:scale-95 transition-transform ${a.borda}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${a.cor}`}>
                  {a.icon}
                </div>
                <p className="text-sm font-bold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{a.descricao}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANIFESTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'manifesto') {
    if (sucesso) return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Distribuição" onBack={voltarHub} />
        <Sucesso
          titulo="Saída registrada!" subtitulo={`Manifesto #${manifesto?.numero}${manifesto?.letra} — ${totalLinhas} cx distribuídas`}
          cor="bg-green-100 [&>svg]:stroke-green-600"
          onNovo={() => { setSucesso(false); setFase(null); setManifesto(null); setManifestoTexto('') }}
          labelNovo="Novo manifesto"
        />
      </div>
    )
    if (sucessoRet) return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Retorno de Vazia" onBack={voltarHub} />
        <Sucesso
          titulo="Retorno registrado!" subtitulo={`Manifesto #${manifesto?.numero}${manifesto?.letra}`}
          cor="bg-teal-100 [&>svg]:stroke-teal-600"
          onNovo={() => { setSucessoRet(false); setFase(null); setManifesto(null); setManifestoTexto('') }}
          labelNovo="Novo manifesto"
        />
      </div>
    )
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Manifesto" onBack={voltarHub} />
        <div className="flex-1 px-4 py-6 space-y-6">

          {/* Lookup */}
          {!manifesto && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Identificar manifesto</p>
              {/* Vídeo sempre no DOM — fix iOS Safari */}
              <div className={scanning ? 'space-y-3' : 'hidden'}>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white/70 rounded-xl" />
                  </div>
                </div>
                {scanError && <p className="text-xs text-red-500 text-center">{scanError}</p>}
                <button onClick={pararScan} className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button>
              </div>
              {!scanning && (
                <>
                  <button onClick={iniciarScan}
                    className="w-full py-4 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ background: PRIMARY }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
                      <rect x="3" y="16" width="5" height="5" rx="1"/>
                      <path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M7 17H3M12 17v4M12 12h4v1"/>
                    </svg>
                    Escanear QR do manifesto
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">ou digite</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={manifestoTexto}
                      onChange={e => { setManifestoTexto(e.target.value); setErroManif('') }}
                      placeholder="ex: 42A"
                      className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-[#5C0F0F]"
                    />
                    <button onClick={() => buscarManifesto(manifestoTexto)} disabled={loadingManif}
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
                <p className="text-lg font-bold text-gray-900 mt-0.5">Manifesto #{manifesto.numero}{manifesto.letra}</p>
                {manifesto.totalCaixas > 0 && <p className="text-sm text-gray-600 mt-1">Total: <span className="font-semibold">{manifesto.totalCaixas} cx</span></p>}
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Quem está levando as caixas?</p>
                {linhas.map((linha, i) => (
                  <div key={i} className="space-y-2">
                    {i > 0 && <div className="h-px bg-gray-100" />}
                    <label className="text-xs font-medium text-gray-500">{i === 0 ? 'Cooperativa' : `Cooperativa ${i + 1}`}</label>
                    <select value={linha.cliente_id}
                      onChange={e => {
                        const nome = clientes.find(c => c.id === e.target.value)?.nome ?? ''
                        setLinhas(p => p.map((l, j) => j === i ? { ...l, cliente_id: e.target.value, nome } : l))
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                      <option value="">Selecione…</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <div className="flex gap-2 items-center">
                      <input type="number" min="1" value={linha.quantidade || ''}
                        onChange={e => setLinhas(p => p.map((l, j) => j === i ? { ...l, quantidade: parseInt(e.target.value) || 0 } : l))}
                        placeholder="Quantidade (cx)"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
                      />
                      {i > 0 && (
                        <button onClick={() => setLinhas(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setLinhas(p => [...p, { cliente_id: '', nome: '', quantidade: remanescente > 0 ? remanescente : 0 }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {remanescente > 0 ? `Adicionar cooperativa (${remanescente} cx restantes)` : 'Adicionar cooperativa'}
                </button>
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
                  className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50" style={{ background: PRIMARY }}>
                  {salvando ? 'Salvando…' : 'Confirmar saída'}
                </button>
              </div>
            </div>
          )}

          {/* Fase 2 — Retorno */}
          {fase === 'retorno' && manifesto && (
            <div className="space-y-4">
              <div className="bg-teal-50 rounded-2xl p-4">
                <p className="text-xs text-teal-600 font-medium uppercase tracking-wide">Retorno de Vazia — Fase 2</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">Manifesto #{manifesto.numero}{manifesto.letra}</p>
                <p className="text-sm text-gray-500 mt-1">Confirme as caixas que estão voltando</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                {distExist.map(d => {
                  const qtd   = qtdesRetorno[d.id] ?? d.saida
                  const falta = d.saida - qtd
                  return (
                    <div key={d.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">{d.clientes?.nome ?? '—'}</p>
                        <p className="text-xs text-gray-400">saiu {d.saida} cx</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="number" min="0" max={d.saida} value={qtd}
                          onChange={e => setQtdesRetorno(p => ({ ...p, [d.id]: parseInt(e.target.value) || 0 }))}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
                        />
                        <span className="text-xs text-gray-400">cx retornando</span>
                      </div>
                      {falta > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-amber-600 font-medium">{falta} cx não retornaram — justificativa obrigatória *</p>
                          <textarea value={justificativas[d.id] ?? ''} rows={2}
                            onChange={e => setJustificativas(p => ({ ...p, [d.id]: e.target.value }))}
                            placeholder="Ex: ficaram na unidade 12176 para próxima semana…"
                            className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500 resize-none bg-amber-50"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
                {erroRetorno && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{erroRetorno}</p>}
                <button onClick={handleSalvarRetorno} disabled={salvandoRet}
                  className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                  style={{ background: '#0d9488' }}>
                  {salvandoRet ? 'Salvando…' : 'Confirmar retorno'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEBIMENTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'receber') {
    const nomeCliente = clientes.find(c => c.id === recForm.cliente_id)?.nome ?? ''
    if (sucessoRec) return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Recebimento" onBack={() => setTela('hub')} />
        <Sucesso titulo="Recebimento registrado!" subtitulo={`${recForm.quantidade} cx — ${nomeCliente}`}
          cor="bg-green-100 [&>svg]:stroke-green-600"
          onNovo={() => { setSucessoRec(false); setRecForm({ cliente_id: '', quantidade: '', data: HOJE, observacao: '' }) }}
          labelNovo="Novo recebimento"
        />
      </div>
    )
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Recebimento" onBack={() => { setTela('hub'); setErroRec('') }} />
        <div className="flex-1 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <p className="text-sm text-gray-500">Registre a entrada de caixas no galpão.</p>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cliente *</label>
              <select value={recForm.cliente_id} onChange={e => setRecForm(p => ({ ...p, cliente_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="">Selecione…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Quantidade (cx) *</label>
              <input type="number" min="1" value={recForm.quantidade} placeholder="0"
                onChange={e => setRecForm(p => ({ ...p, quantidade: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
              <input type="date" value={recForm.data} max={HOJE}
                onChange={e => setRecForm(p => ({ ...p, data: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Observação</label>
              <textarea value={recForm.observacao} rows={2} placeholder="Ex: 4 cx a mais do pedido…"
                onChange={e => setRecForm(p => ({ ...p, observacao: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] resize-none"
              />
            </div>
            {erroRec && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{erroRec}</p>}
            <button onClick={handleSalvarRecebimento} disabled={salvandoRec}
              className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: '#16a34a' }}>
              {salvandoRec ? 'Salvando…' : 'Confirmar recebimento'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VENDA / RETIRADA
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'venda' || tela === 'retirada') {
    const cfg = tela === 'venda'
      ? { titulo: 'Venda', desc: 'Registre a saída de caixas por venda.', cor: '#ea580c', corSucesso: 'bg-orange-100 [&>svg]:stroke-orange-600', labelBtn: 'Confirmar venda' }
      : { titulo: 'Retirada', desc: 'Cooperativa retira caixas vazias do galpão.', cor: '#db2777', corSucesso: 'bg-pink-100 [&>svg]:stroke-pink-600', labelBtn: 'Confirmar retirada' }
    const nomeCliente = clientes.find(c => c.id === saidaForm.cliente_id)?.nome ?? ''
    if (sucessoSaida) return (
      <div className="flex flex-col min-h-screen">
        <Header titulo={cfg.titulo} onBack={() => setTela('hub')} />
        <Sucesso titulo={`${cfg.titulo} registrada!`} subtitulo={`${saidaForm.quantidade} cx — ${nomeCliente}`}
          cor={cfg.corSucesso}
          onNovo={() => { setSucessoSaida(false); setSaidaForm({ cliente_id: '', quantidade: '', data: HOJE, observacao: '' }) }}
          labelNovo={`Nova ${tela}`}
        />
      </div>
    )
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo={cfg.titulo} onBack={() => { setTela('hub'); setErroSaidaSimp('') }} />
        <div className="flex-1 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <p className="text-sm text-gray-500">{cfg.desc}</p>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cliente *</label>
              <select value={saidaForm.cliente_id} onChange={e => setSaidaForm(p => ({ ...p, cliente_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="">Selecione…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Quantidade (cx) *</label>
              <input type="number" min="1" value={saidaForm.quantidade} placeholder="0"
                onChange={e => setSaidaForm(p => ({ ...p, quantidade: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
              <input type="date" value={saidaForm.data} max={HOJE}
                onChange={e => setSaidaForm(p => ({ ...p, data: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Observação</label>
              <textarea value={saidaForm.observacao} rows={2} placeholder="Ex: vendido para unidade 12176…"
                onChange={e => setSaidaForm(p => ({ ...p, observacao: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] resize-none"
              />
            </div>
            {erroSaidaSimp && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{erroSaidaSimp}</p>}
            <button onClick={() => handleSalvarSaidaSimples(tela)} disabled={salvandoSaida}
              className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: cfg.cor }}>
              {salvandoSaida ? 'Salvando…' : cfg.labelBtn}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AJUSTE
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'ajuste') {
    if (sucessoAj) return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Ajuste" onBack={() => setTela('hub')} />
        <Sucesso titulo="Ajuste registrado!" subtitulo=""
          cor="bg-amber-100 [&>svg]:stroke-amber-600"
          onNovo={() => { setSucessoAj(false); setAjForm({ cliente_id: '', quantidade: '', direcao: 'entrada', data: HOJE, observacao: '' }) }}
          labelNovo="Novo ajuste"
        />
      </div>
    )
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Ajuste de Saldo" onBack={() => { setTela('hub'); setErroAj('') }} />
        <div className="flex-1 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <p className="text-sm text-gray-500">Corrija divergências no estoque após inventário.</p>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cliente *</label>
              <select value={ajForm.cliente_id} onChange={e => setAjForm(p => ({ ...p, cliente_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="">Selecione…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Direção *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['entrada', 'saida'] as const).map(d => (
                  <button key={d} type="button"
                    onClick={() => setAjForm(p => ({ ...p, direcao: d }))}
                    className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${ajForm.direcao === d ? 'border-[#5C0F0F] text-[#5C0F0F] bg-[#5C0F0F]/5' : 'border-gray-200 text-gray-500'}`}>
                    {d === 'entrada' ? '+ Entrada' : '− Saída'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Quantidade (cx) *</label>
              <input type="number" min="1" value={ajForm.quantidade} placeholder="0"
                onChange={e => setAjForm(p => ({ ...p, quantidade: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
              <input type="date" value={ajForm.data} max={HOJE}
                onChange={e => setAjForm(p => ({ ...p, data: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Motivo do ajuste *</label>
              <textarea value={ajForm.observacao} rows={2} placeholder="Ex: contagem física revelou 3 cx extras…"
                onChange={e => setAjForm(p => ({ ...p, observacao: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] resize-none"
              />
            </div>
            {erroAj && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{erroAj}</p>}
            <button onClick={handleSalvarAjuste} disabled={salvandoAj}
              className="w-full py-4 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: '#d97706' }}>
              {salvandoAj ? 'Salvando…' : 'Confirmar ajuste'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRATO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tela === 'extrato') {
    return (
      <div className="flex flex-col min-h-screen">
        <Header titulo="Extrato" onBack={() => setTela('hub')} />
        <div className="flex-1 px-4 py-6 space-y-4">

          {/* Saldos por cliente */}
          {!loadingExt && movimentos.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Saldo por cliente</p>
              <div className="divide-y divide-gray-50">
                {clientes.filter(c => saldoPorCliente[c.id] !== undefined).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">{c.nome}</span>
                    <span className={`text-sm font-bold tabular-nums ${(saldoPorCliente[c.id] ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {saldoPorCliente[c.id] ?? 0} cx
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtro */}
          <div className="flex gap-2">
            <select value={filtroExtCliente} onChange={e => setFiltroExtCliente(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              <option value="">Todos os clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {filtroExtCliente && (
              <button onClick={() => setFiltroExtCliente('')} className="px-3 text-xs text-gray-500 border border-gray-200 rounded-xl">
                Limpar
              </button>
            )}
          </div>

          {/* Lista */}
          {loadingExt ? (
            <p className="text-sm text-center text-gray-400 py-8">Carregando…</p>
          ) : extratofiltrado.length === 0 ? (
            <p className="text-sm text-center text-gray-400 py-8">Nenhum lançamento encontrado.</p>
          ) : (
            <div className="space-y-2">
              {extratofiltrado.map(m => {
                const numManif = m.ciclo_manifestos
                  ? `#${String(m.ciclo_manifestos.numero_base).padStart(4, '0')}${m.ciclo_manifestos.letra}`
                  : null
                return (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TIPO_COR[m.tipo] ?? 'text-gray-600 bg-gray-50'}`}>
                          {TIPO_LABEL[m.tipo] ?? m.tipo}
                        </span>
                        {numManif && <span className="text-[10px] text-gray-400 font-mono">{numManif}</span>}
                      </div>
                      <p className="text-xs text-gray-600 truncate">{m.clientes?.nome ?? '—'}</p>
                      {m.observacao && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{m.observacao}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {m.entrada > 0 && <p className="text-sm font-bold text-green-700">+{m.entrada}</p>}
                      {m.saida   > 0 && <p className="text-sm font-bold text-red-600">−{m.saida}</p>}
                      <p className="text-[10px] text-gray-400">
                        {new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
