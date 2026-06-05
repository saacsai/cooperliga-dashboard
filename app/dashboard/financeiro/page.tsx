'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

type Status = 'aguardando_nf' | 'nf_recebida' | 'aprovado' | 'pago'

const STATUS_CONFIG: Record<Status, { label: string; badge: string }> = {
  aguardando_nf: { label: 'Aguardando NF',  badge: 'bg-yellow-100 text-yellow-700' },
  nf_recebida:   { label: 'NF Recebida',    badge: 'bg-blue-100 text-blue-700'     },
  aprovado:      { label: 'Aprovado',       badge: 'bg-green-100 text-green-700'   },
  pago:          { label: 'Pago',           badge: 'bg-teal-100 text-teal-700'     },
}

type PagamentoItem = {
  id: string
  manifesto_id: string
  rota_id: string | null
  valor: number
  ciclo_manifestos: { numero_base: number; letra: string; data_entrega: string } | null
  rotas: { nome: string; codigo: string } | null
}

type Pagamento = {
  id: string
  agregado_id: string
  semana_ref: string
  data_vencimento: string
  valor_total: number
  status: Status
  nf_numero: string | null
  nf_arquivo: string | null
  observacao: string | null
  data_pagamento: string | null
  agregados: { nome: string } | null
  pagamentos_itens: PagamentoItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtSemana(s: string) {
  const d = new Date(s + 'T12:00:00')
  const fim = new Date(s + 'T12:00:00')
  fim.setDate(fim.getDate() + 4)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numManif(item: PagamentoItem) {
  if (!item.ciclo_manifestos) return '?'
  const { numero_base, letra } = item.ciclo_manifestos
  return `#${String(numero_base).padStart(4, '0')}${letra}`
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const [pagamentos,  setPagamentos]  = useState<Pagamento[]>([])
  const [loading,     setLoading]     = useState(true)
  const [gerando,     setGerando]     = useState(false)
  const [msg,         setMsg]         = useState('')

  const [filtroStatus,    setFiltroStatus]    = useState<Status | ''>('')
  const [filtroVencimento, setFiltroVencimento] = useState('')

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const [editandoNF,  setEditandoNF]  = useState<Record<string, string>>({})
  const [carregandoNF, setCarregandoNF] = useState<string | null>(null)

  async function verNF(pagamentoId: string) {
    setCarregandoNF(pagamentoId)
    const { data: { session } } = await getSupabase().auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/pagamentos/nf-url?pagamento_id=${pagamentoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setCarregandoNF(null)
    if (data.url) window.open(data.url, '_blank')
  }

  async function carregar() {
    setLoading(true)
    const { data } = await getSupabase()
      .from('pagamentos_agregados')
      .select(`
        id, agregado_id, semana_ref, data_vencimento, valor_total,
        status, nf_numero, observacao, data_pagamento,
        agregados(nome),
        pagamentos_itens(
          id, manifesto_id, rota_id, valor,
          ciclo_manifestos(numero_base, letra, data_entrega),
          rotas(nome, codigo)
        )
      `)
      .order('data_vencimento', { ascending: true })
      .order('agregados(nome)', { ascending: true })
    setPagamentos((data || []) as unknown as Pagamento[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  // ── Gerar pagamentos ────────────────────────────────────────────────────────
  async function gerarPagamentos() {
    setGerando(true); setMsg('')
    const sb = getSupabase()

    // Manifestos com rota tendo agregado + valor_frete
    const { data: manifestos } = await sb
      .from('ciclo_manifestos')
      .select('id, data_entrega, rota_id, rotas!inner(id, agregado_id, valor_frete)')
      .not('rotas.agregado_id', 'is', null)
      .not('rotas.valor_frete', 'is', null)

    if (!manifestos?.length) { setGerando(false); setMsg('Nenhum manifesto elegível encontrado.'); return }

    // IDs já processados
    const { data: existentes } = await sb.from('pagamentos_itens').select('manifesto_id')
    const existentesSet = new Set((existentes || []).map((e: any) => e.manifesto_id))

    // Agrupa novos por (agregado_id, semana_ref)
    type Grupo = {
      agregado_id: string; semana_ref: string; data_vencimento: string
      itens: Array<{ manifesto_id: string; rota_id: string; valor: number }>
    }
    const grupos = new Map<string, Grupo>()

    for (const m of manifestos) {
      if (existentesSet.has(m.id)) continue
      const rota = (m as any).rotas
      if (!rota?.agregado_id || !rota?.valor_frete) continue
      const semana_ref = getMondayOfWeek(m.data_entrega)
      const key = `${rota.agregado_id}__${semana_ref}`
      if (!grupos.has(key)) {
        grupos.set(key, {
          agregado_id: rota.agregado_id,
          semana_ref,
          data_vencimento: addDays(semana_ref, 25),
          itens: [],
        })
      }
      grupos.get(key)!.itens.push({ manifesto_id: m.id, rota_id: m.rota_id, valor: rota.valor_frete })
    }

    if (!grupos.size) { setGerando(false); setMsg('Todos os manifestos já foram processados.'); return }

    let totalNovos = 0
    for (const grupo of Array.from(grupos.values())) {
      // Busca ou cria cabeçalho
      const { data: ex } = await sb.from('pagamentos_agregados')
        .select('id').eq('agregado_id', grupo.agregado_id).eq('semana_ref', grupo.semana_ref).maybeSingle()

      let pag_id: string
      if (ex) {
        pag_id = ex.id
      } else {
        const { data: novo, error } = await sb.from('pagamentos_agregados')
          .insert({
            agregado_id:    grupo.agregado_id,
            semana_ref:     grupo.semana_ref,
            data_vencimento: grupo.data_vencimento,
            valor_total:    0,
          })
          .select('id').single()
        if (error || !novo) continue
        pag_id = novo.id
      }

      // Insere itens novos (ignora duplicatas)
      await sb.from('pagamentos_itens').upsert(
        grupo.itens.map(i => ({ pagamento_id: pag_id, ...i })),
        { onConflict: 'manifesto_id', ignoreDuplicates: true }
      )
      totalNovos += grupo.itens.length

      // Recalcula valor_total
      const { data: itens } = await sb.from('pagamentos_itens').select('valor').eq('pagamento_id', pag_id)
      const total = (itens || []).reduce((a: number, i: { valor: number }) => a + Number(i.valor), 0)
      await sb.from('pagamentos_agregados').update({ valor_total: total }).eq('id', pag_id)
    }

    setGerando(false)
    setMsg(`${totalNovos} item(ns) gerado(s) com sucesso.`)
    carregar()
  }

  // ── Atualizar status ────────────────────────────────────────────────────────
  async function atualizarStatus(id: string, status: Status, extra: Record<string, unknown> = {}) {
    await getSupabase().from('pagamentos_agregados').update({ status, updated_at: new Date().toISOString(), ...extra }).eq('id', id)
    carregar()
  }

  // ── Salvar NF ───────────────────────────────────────────────────────────────
  async function salvarNF(id: string) {
    const nf = editandoNF[id]?.trim()
    if (!nf) return
    await getSupabase().from('pagamentos_agregados').update({
      nf_numero: nf, status: 'nf_recebida', updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditandoNF(p => { const n = { ...p }; delete n[id]; return n })
    carregar()
  }

  // ── Bulk ────────────────────────────────────────────────────────────────────
  async function bulkAtualizarStatus(status: Status, extra: Record<string, unknown> = {}) {
    for (const id of Array.from(selecionados)) {
      await getSupabase().from('pagamentos_agregados').update({ status, updated_at: new Date().toISOString(), ...extra }).eq('id', id)
    }
    setSelecionados(new Set()); carregar()
  }

  // ── Dados computados ────────────────────────────────────────────────────────
  const vencimentosDistintos = useMemo(() =>
    Array.from(new Set(pagamentos.map(p => p.data_vencimento))).sort(),
    [pagamentos]
  )

  const filtrados = useMemo(() => pagamentos.filter(p => {
    if (filtroStatus && p.status !== filtroStatus) return false
    if (filtroVencimento && p.data_vencimento !== filtroVencimento) return false
    return true
  }), [pagamentos, filtroStatus, filtroVencimento])

  const totalSelecionado = useMemo(() =>
    filtrados.filter(p => selecionados.has(p.id)).reduce((a, p) => a + p.valor_total, 0),
    [filtrados, selecionados]
  )

  // Stats
  const stats = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0]
    // Próxima sexta
    const d = new Date()
    const diasParaSexta = (5 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diasParaSexta)
    const proximaSexta = d.toISOString().split('T')[0]

    return {
      estaSemanaPagar: pagamentos.filter(p => p.data_vencimento === proximaSexta && p.status === 'aprovado').reduce((a, p) => a + p.valor_total, 0),
      aguardandoNF:    pagamentos.filter(p => p.status === 'aguardando_nf').length,
      nfRecebida:      pagamentos.filter(p => p.status === 'nf_recebida').length,
      aprovado:        pagamentos.filter(p => p.status === 'aprovado').reduce((a, p) => a + p.valor_total, 0),
    }
  }, [pagamentos])

  function toggleExpand(id: string) {
    setExpandidos(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelect(id: string) {
    setSelecionados(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    if (selecionados.size === filtrados.length) setSelecionados(new Set())
    else setSelecionados(new Set(filtrados.map(p => p.id)))
  }

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Financeiro — Agregados</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contas a pagar por manifesto entregue</p>
        </div>
        <button
          onClick={gerarPagamentos} disabled={gerando}
          className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ background: PRIMARY }}>
          {gerando ? 'Gerando…' : '↻ Gerar pagamentos'}
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">{msg}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'A pagar esta sexta', value: fmtMoeda(stats.estaSemanaPagar), sub: 'aprovados', cor: 'text-green-700' },
          { label: 'Aguardando NF',      value: String(stats.aguardandoNF),       sub: 'lotes',    cor: 'text-yellow-600' },
          { label: 'NF recebida',        value: String(stats.nfRecebida),          sub: 'lotes',    cor: 'text-blue-600' },
          { label: 'Total aprovado',     value: fmtMoeda(stats.aprovado),         sub: 'a pagar',  cor: 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.cor}`}>{s.value}</p>
            <p className="text-[10px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filtroVencimento} onChange={e => setFiltroVencimento(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C0F0F] bg-white">
          <option value="">Todos os vencimentos</option>
          {vencimentosDistintos.map(v => (
            <option key={v} value={v}>Vence {fmtDate(v)}</option>
          ))}
        </select>

        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as Status | '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C0F0F] bg-white">
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {(filtroStatus || filtroVencimento) && (
          <button onClick={() => { setFiltroStatus(''); setFiltroVencimento('') }}
            className="text-xs text-gray-400 hover:text-gray-700">Limpar filtros</button>
        )}

        <span className="ml-auto text-xs text-gray-400 self-center">{filtrados.length} lotes</span>
      </div>

      {/* Bulk bar */}
      {selecionados.size > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-gray-900 rounded-xl text-white">
          <span className="text-sm font-medium">{selecionados.size} selecionado(s) — {fmtMoeda(totalSelecionado)}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => bulkAtualizarStatus('aprovado')}
              className="text-xs bg-green-500 hover:bg-green-400 px-3 py-1.5 rounded-lg font-medium">
              Aprovar selecionados
            </button>
            <button onClick={() => bulkAtualizarStatus('pago', { data_pagamento: new Date().toISOString().split('T')[0] })}
              className="text-xs bg-teal-500 hover:bg-teal-400 px-3 py-1.5 rounded-lg font-medium">
              Marcar como pago
            </button>
            <button onClick={() => setSelecionados(new Set())}
              className="text-xs text-gray-400 hover:text-white px-2">✕</button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center">
          <p className="text-sm text-gray-400">Nenhum lançamento encontrado.</p>
          <p className="text-xs text-gray-400 mt-1">Clique em "Gerar pagamentos" para criar os registros a partir dos manifestos.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={selecionados.size === filtrados.length && filtrados.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-[#5C0F0F]" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Agregado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Semana trabalhada</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Vencimento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Manifestos</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">NF</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => {
                const itens = (p.pagamentos_itens || []) as unknown as PagamentoItem[]
                const exp   = expandidos.has(p.id)
                const sel   = selecionados.has(p.id)
                const cfg   = STATUS_CONFIG[p.status]

                return (
                  <>
                    <tr key={p.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${sel ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.id)} className="accent-[#5C0F0F]" />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 text-xs">{p.agregados?.nome ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">{fmtSemana(p.semana_ref)}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 tabular-nums font-medium">{fmtDate(p.data_vencimento)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(p.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                          <span>{itens.length} manifesto{itens.length !== 1 ? 's' : ''}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            className={`transition-transform ${exp ? 'rotate-180' : ''}`}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-gray-800">
                        {fmtMoeda(p.valor_total)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.nf_numero ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-gray-700">{p.nf_numero}</span>
                            {p.nf_arquivo && (
                              <button
                                onClick={() => verNF(p.id)}
                                disabled={carregandoNF === p.id}
                                title="Ver arquivo da NF"
                                className="text-[10px] text-blue-500 hover:text-blue-700 disabled:opacity-50 underline underline-offset-2"
                              >
                                {carregandoNF === p.id ? '…' : 'ver'}
                              </button>
                            )}
                          </div>
                        ) : p.nf_arquivo ? (
                          <button
                            onClick={() => verNF(p.id)}
                            disabled={carregandoNF === p.id}
                            className="text-blue-500 hover:text-blue-700 disabled:opacity-50 underline underline-offset-2"
                          >
                            {carregandoNF === p.id ? '…' : 'Ver NF'}
                          </button>
                        ) : p.status !== 'pago' ? (
                          editandoNF[p.id] !== undefined ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={editandoNF[p.id]}
                                onChange={e => setEditandoNF(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && salvarNF(p.id)}
                                placeholder="Nº NF"
                                autoFocus
                                className="w-24 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-[#5C0F0F] font-mono"
                              />
                              <button onClick={() => salvarNF(p.id)}
                                className="text-green-600 hover:text-green-700 text-xs font-medium">✓</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditandoNF(prev => ({ ...prev, [p.id]: '' }))}
                              className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
                              Informar NF
                            </button>
                          )
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {p.status === 'nf_recebida' && (
                            <button onClick={() => atualizarStatus(p.id, 'aprovado')}
                              className="text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap">
                              Aprovar
                            </button>
                          )}
                          {p.status === 'aprovado' && (
                            <button onClick={() => atualizarStatus(p.id, 'pago', { data_pagamento: new Date().toISOString().split('T')[0] })}
                              className="text-xs text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap">
                              Marcar pago
                            </button>
                          )}
                          {p.status === 'pago' && p.data_pagamento && (
                            <span className="text-[10px] text-gray-400 tabular-nums">{fmtDate(p.data_pagamento)}</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Itens expandidos */}
                    {exp && (
                      <tr key={`${p.id}-exp`} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="flex flex-col gap-1.5">
                            {itens.map(item => (
                              <div key={item.id} className="flex items-center gap-4 text-xs text-gray-600">
                                <span className="font-mono font-medium text-gray-800 w-20">{numManif(item)}</span>
                                <span className="text-gray-500">
                                  {item.ciclo_manifestos ? fmtDate(item.ciclo_manifestos.data_entrega) : '—'}
                                </span>
                                <span className="flex-1 truncate text-gray-500">
                                  {item.rotas?.nome ?? '—'}
                                </span>
                                <span className="font-medium tabular-nums text-gray-800">{fmtMoeda(item.valor)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-4 py-2 text-right text-xs font-bold tabular-nums text-gray-900">
                    {fmtMoeda(filtrados.reduce((a, p) => a + p.valor_total, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
