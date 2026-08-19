'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { CeafPedido, CeafCiclo, CeafEmpresa } from '@/lib/supabase'

const PRIMARY = '#072740'

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  pendente:  { label: 'Pendente',  badge: 'bg-yellow-100 text-yellow-700' },
  pago:      { label: 'Pago',      badge: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', badge: 'bg-gray-100 text-gray-500' },
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

export default function PedidosPage() {
  const [ciclos,    setCiclos]    = useState<CeafCiclo[]>([])
  const [empresas,  setEmpresas]  = useState<Pick<CeafEmpresa, 'id' | 'nome'>[]>([])
  const [pedidos,   setPedidos]   = useState<CeafPedido[]>([])
  const [loading,   setLoading]   = useState(true)
  const [cicloSel,  setCicloSel]  = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')

  const pedidosFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return pedidos
    return pedidos.filter(p => p.status === filtroStatus)
  }, [pedidos, filtroStatus])

  const resumo = useMemo(() => ({
    total: pedidos.length,
    pagos: pedidos.filter(p => p.status === 'pago').length,
    pendentes: pedidos.filter(p => p.status === 'pendente').length,
    valorTotal: pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => s + p.valor_total, 0),
    valorPago: pedidos.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor_total, 0),
  }), [pedidos])

  async function carregar() {
    const sb = getSupabase()
    const [{ data: cics }, { data: emps }] = await Promise.all([
      sb.from('ceaf_ciclos').select('*, ceaf_empresas(nome)').order('semana_ref', { ascending: false }).limit(20),
      sb.from('ceaf_empresas').select('id, nome').eq('ativa', true).order('nome'),
    ])
    const ciclosList = (cics as CeafCiclo[]) || []
    setCiclos(ciclosList)
    setEmpresas(emps || [])
    if (ciclosList.length > 0 && !cicloSel) {
      setCicloSel(ciclosList[0].id)
    }
    setLoading(false)
  }

  async function carregarPedidos(cid: string) {
    if (!cid) { setPedidos([]); return }
    const { data } = await getSupabase()
      .from('ceaf_pedidos')
      .select('*, ceaf_funcionarios(nome, whatsapp), ceaf_pedidos_itens(*, ceaf_produtos(nome, unidade))')
      .eq('ciclo_id', cid)
      .order('created_at')
    setPedidos((data as CeafPedido[]) || [])
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (cicloSel) carregarPedidos(cicloSel)
  }, [cicloSel])

  async function marcarPago(p: CeafPedido) {
    await getSupabase()
      .from('ceaf_pedidos')
      .update({ status: 'pago', pago_em: new Date().toISOString() })
      .eq('id', p.id)
    carregarPedidos(cicloSel)
  }

  async function cancelar(p: CeafPedido) {
    await getSupabase().from('ceaf_pedidos').update({ status: 'cancelado' }).eq('id', p.id)
    carregarPedidos(cicloSel)
  }

  const cicloAtual = ciclos.find(c => c.id === cicloSel)

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Pedidos recebidos via WhatsApp por ciclo</p>
        </div>
        <select
          value={cicloSel}
          onChange={e => setCicloSel(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740] bg-white min-w-[220px]"
        >
          <option value="">Selecione um ciclo</option>
          {ciclos.map(c => (
            <option key={c.id} value={c.id}>
              {c.ceaf_empresas?.nome} — {c.data_entrega ? fmtDate(c.data_entrega) : c.semana_ref}
            </option>
          ))}
        </select>
      </div>

      {cicloSel && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total pedidos', value: resumo.total },
              { label: 'Pagos', value: resumo.pagos },
              { label: 'Pendentes', value: resumo.pendentes },
              { label: 'Valor pago', value: fmtMoeda(resumo.valorPago) },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-4">
            {['todos', 'pendente', 'pago', 'cancelado'].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtroStatus === s
                    ? 'text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                style={filtroStatus === s ? { background: PRIMARY } : {}}>
                {s === 'todos' ? 'Todos' : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-sm">
                {pedidos.length === 0 ? 'Nenhum pedido neste ciclo ainda.' : 'Nenhum pedido com este status.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Funcionário</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Itens</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Slot</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.map(p => {
                    const func = p.ceaf_funcionarios
                    const itens = p.ceaf_pedidos_itens || []
                    const config = STATUS_CONFIG[p.status]
                    return (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{func?.nome || '—'}</p>
                          {func?.whatsapp && <p className="text-xs text-gray-400 font-mono">{func.whatsapp}</p>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="space-y-0.5">
                            {itens.map(item => (
                              <p key={item.id} className="text-xs text-gray-600">
                                {item.quantidade}× {item.ceaf_produtos?.nome}
                              </p>
                            ))}
                            {itens.length === 0 && <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-gray-500">{p.slot_retirada || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-gray-900">{fmtMoeda(p.valor_total)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badge}`}>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {p.status === 'pendente' && (
                              <>
                                <button onClick={() => marcarPago(p)}
                                  className="text-xs font-medium px-2 py-1 rounded text-white"
                                  style={{ background: '#16a34a' }}>
                                  Pago
                                </button>
                                <button onClick={() => cancelar(p)}
                                  className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50">
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
