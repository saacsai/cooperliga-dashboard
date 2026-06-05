'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type Tela = 'carregando' | 'otp' | 'portal' | 'erro'

type PagamentoItem = {
  id: string
  valor: number
  ciclo_manifestos: { numero_base: number; letra: string; data_entrega: string } | null
  rotas: { nome: string } | null
}

type Pagamento = {
  id: string
  semana_ref: string
  data_vencimento: string
  valor_total: number
  status: 'aguardando_nf' | 'nf_recebida' | 'aprovado' | 'pago'
  nf_numero: string | null
  nf_arquivo: string | null
  pagamentos_itens: PagamentoItem[]
}

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  aguardando_nf: { label: 'Aguardando NF', cor: 'bg-yellow-50 text-yellow-600' },
  nf_recebida:   { label: 'NF Enviada',    cor: 'bg-blue-50 text-blue-600'     },
  aprovado:      { label: 'Aprovado',      cor: 'bg-green-50 text-green-600'   },
  pago:          { label: 'Pago',          cor: 'bg-teal-50 text-teal-600'     },
}

const PRIMARY = '#5C0F0F'

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtSemana(s: string) {
  const ini = new Date(s + 'T12:00:00')
  const fim = new Date(s + 'T12:00:00')
  fim.setDate(fim.getDate() + 4)
  return `${ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}

function numManif(item: PagamentoItem) {
  if (!item.ciclo_manifestos) return '?'
  return `#${String(item.ciclo_manifestos.numero_base).padStart(4, '0')}${item.ciclo_manifestos.letra}`
}

export default function PortalAgregado({ params }: { params: { token: string } }) {
  const [tela,      setTela]      = useState<Tela>('carregando')
  const [nome,      setNome]      = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [errGlobal, setErrGlobal] = useState('')

  // OTP
  const [otpInput,     setOtpInput]     = useState('')
  const [verificando,  setVerificando]  = useState(false)
  const [errOtp,       setErrOtp]       = useState('')
  const [reenviando,   setReenviando]   = useState(false)
  const [msgReenvio,   setMsgReenvio]   = useState('')

  // Upload por pagamento
  const [arquivo,    setArquivo]    = useState<Record<string, File>>({})
  const [nfNumInput, setNfNumInput] = useState<Record<string, string>>({})
  const [upStatus,   setUpStatus]   = useState<Record<string, 'idle' | 'uploading' | 'done' | 'erro'>>({})

  async function carregar() {
    setTela('carregando')
    try {
      const res  = await fetch(`/api/portal/${params.token}`)
      const data = await res.json()
      if (!res.ok) { setErrGlobal(data.error || 'Erro ao carregar'); setTela('erro'); return }
      setNome(data.nome || '')
      if (data.ok) {
        setPagamentos(data.pagamentos || [])
        setTela('portal')
      } else {
        if (data.error === 'rate_limit') setErrOtp(data.message)
        setTela('otp')
      }
    } catch {
      setErrGlobal('Erro de conexão.'); setTela('erro')
    }
  }

  useEffect(() => { carregar() }, [])

  async function handleVerificar(e: React.FormEvent) {
    e.preventDefault()
    if (otpInput.length < 6) return
    setVerificando(true); setErrOtp('')
    const res  = await fetch(`/api/portal/${params.token}/verify-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: otpInput }),
    })
    const data = await res.json()
    if (!res.ok) { setErrOtp(data.error || 'Código inválido.'); setVerificando(false); return }
    setOtpInput(''); setVerificando(false)
    carregar()
  }

  async function handleReenviar() {
    setReenviando(true); setMsgReenvio(''); setErrOtp('')
    await fetch(`/api/portal/${params.token}`)
    setReenviando(false)
    setMsgReenvio('Novo código enviado para seu WhatsApp.')
  }

  async function handleUpload(pagamentoId: string) {
    const file = arquivo[pagamentoId]
    if (!file) return
    setUpStatus(p => ({ ...p, [pagamentoId]: 'uploading' }))

    const fd = new FormData()
    fd.append('file', file)
    fd.append('pagamento_id', pagamentoId)
    const nfNum = nfNumInput[pagamentoId]?.trim()
    if (nfNum) fd.append('nf_numero', nfNum)

    const res = await fetch(`/api/portal/${params.token}/upload-nf`, { method: 'POST', body: fd })
    if (res.ok) {
      setUpStatus(p => ({ ...p, [pagamentoId]: 'done' }))
      setTimeout(carregar, 1500)
    } else {
      setUpStatus(p => ({ ...p, [pagamentoId]: 'erro' }))
    }
  }

  const pendentes = pagamentos.filter(p => p.status === 'aguardando_nf')
  const historico = pagamentos.filter(p => p.status !== 'aguardando_nf')

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (tela === 'carregando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Carregando…</p>
      </div>
    )
  }

  // ── Erro ─────────────────────────────────────────────────────────────────────
  if (tela === 'erro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-gray-500 text-sm">{errGlobal || 'Link inválido.'}</p>
        <p className="text-xs text-gray-400 mt-2">Entre em contato com o gestor.</p>
      </div>
    )
  }

  // ── OTP ──────────────────────────────────────────────────────────────────────
  if (tela === 'otp') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <Image src="/logo_fonte.jpg" alt="CooperLiga" width={140} height={36} className="object-contain" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-lg font-bold text-gray-900 text-center mb-1">
              {nome ? `Olá, ${nome.split(' ')[0]}!` : 'Portal CooperLiga'}
            </h1>
            <p className="text-sm text-gray-500 text-center mb-6">
              Enviamos um código para seu WhatsApp. Digite abaixo para acessar.
            </p>

            <form onSubmit={handleVerificar} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpInput}
                onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="000 000"
                autoFocus
                className="w-full text-center text-3xl font-mono tracking-[0.5em] border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-[#5C0F0F]"
              />

              {errOtp && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{errOtp}</p>
              )}

              <button
                type="submit"
                disabled={verificando || otpInput.length < 6}
                className="w-full py-3 rounded-xl text-white font-medium text-sm disabled:opacity-40"
                style={{ background: PRIMARY }}
              >
                {verificando ? 'Verificando…' : 'Entrar'}
              </button>
            </form>

            <div className="mt-5 text-center">
              {msgReenvio ? (
                <p className="text-xs text-green-600">{msgReenvio}</p>
              ) : (
                <button
                  onClick={handleReenviar}
                  disabled={reenviando}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 underline underline-offset-2"
                >
                  {reenviando ? 'Reenviando…' : 'Não recebeu? Reenviar código'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Portal ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center" style={{ background: PRIMARY }}>
        <Image src="/logo_fonte.jpg" alt="CooperLiga" width={110} height={28} className="object-contain brightness-0 invert" />
        {nome && <span className="text-white/70 text-sm ml-auto">{nome.split(' ')[0]}</span>}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* Pendentes */}
        {pendentes.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pendente de NF</h2>
            <div className="space-y-4">
              {pendentes.map(p => {
                const st   = upStatus[p.id] || 'idle'
                const arq  = arquivo[p.id]
                const itens = p.pagamentos_itens || []

                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="text-xs text-gray-500">{fmtSemana(p.semana_ref)}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">{fmtMoeda(p.valor_total)}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 font-medium mt-1">
                        Enviar NF
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 mb-3">Vence {fmtDate(p.data_vencimento)}</p>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {itens.map(item => (
                        <span key={item.id} className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                          {numManif(item)}
                        </span>
                      ))}
                    </div>

                    {st === 'done' ? (
                      <div className="flex items-center justify-center gap-2 py-3 bg-green-50 rounded-xl">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span className="text-sm text-green-700 font-medium">NF enviada com sucesso!</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-[#5C0F0F]/30 transition-colors">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: arq ? '#111' : PRIMARY }}>
                              {arq ? arq.name : 'Selecionar NF'}
                            </p>
                            <p className="text-xs text-gray-400">{arq ? '' : 'PDF ou foto · máx. 10MB'}</p>
                          </div>
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (f) setArquivo(prev => ({ ...prev, [p.id]: f }))
                              setUpStatus(prev => ({ ...prev, [p.id]: 'idle' }))
                            }}
                          />
                        </label>

                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Número da NF (opcional)"
                          value={nfNumInput[p.id] || ''}
                          onChange={e => setNfNumInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#5C0F0F] font-mono"
                        />

                        {st === 'erro' && (
                          <p className="text-xs text-red-600 text-center">Erro ao enviar. Tente novamente.</p>
                        )}

                        <button
                          onClick={() => handleUpload(p.id)}
                          disabled={!arq || st === 'uploading'}
                          className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
                          style={{ background: PRIMARY }}
                        >
                          {st === 'uploading' ? 'Enviando…' : 'Confirmar envio'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm font-medium text-gray-700">Nenhuma NF pendente</p>
            <p className="text-xs text-gray-400 mt-1">Você está em dia!</p>
          </div>
        )}

        {/* Histórico */}
        {historico.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Histórico</h2>
            <div className="space-y-2">
              {historico.map(p => {
                const cfg = STATUS_LABEL[p.status] || { label: p.status, cor: 'bg-gray-50 text-gray-500' }
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{fmtSemana(p.semana_ref)}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{fmtMoeda(p.valor_total)}</p>
                      {p.nf_numero && <p className="text-xs text-gray-400 font-mono">NF {p.nf_numero}</p>}
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
