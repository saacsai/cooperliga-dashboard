'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { CeafPedido, CeafCiclo } from '@/lib/supabase'

const PRIMARY = '#072740'

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Slots de retirada padrão
const SLOTS = ['07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00', 'sem slot']

export default function MontagemPage() {
  const [ciclos,   setCiclos]   = useState<CeafCiclo[]>([])
  const [pedidos,  setPedidos]  = useState<CeafPedido[]>([])
  const [loading,  setLoading]  = useState(true)
  const [cicloSel, setCicloSel] = useState<string>('')
  const [slotSel,  setSlotSel]  = useState<string>('todos')
  const [salvando, setSalvando] = useState<string | null>(null)

  const pedidosFiltrados = useMemo(() => {
    const ativos = pedidos.filter(p => p.status !== 'cancelado')
    if (slotSel === 'todos') return ativos
    if (slotSel === 'sem slot') return ativos.filter(p => !p.slot_retirada)
    return ativos.filter(p => p.slot_retirada === slotSel)
  }, [pedidos, slotSel])

  const slotsUsados = useMemo(() => {
    const usados = new Set(pedidos.map(p => p.slot_retirada || 'sem slot'))
    return SLOTS.filter(s => usados.has(s))
  }, [pedidos])

  async function carregar() {
    const { data: cics } = await getSupabase()
      .from('ceaf_ciclos')
      .select('*, ceaf_empresas(nome)')
      .in('status', ['fechado', 'consolidado', 'entregue'])
      .order('data_entrega', { ascending: false })
      .limit(10)
    const ciclosList = (cics as CeafCiclo[]) || []
    setCiclos(ciclosList)
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
      .order('slot_retirada', { ascending: true, nullsFirst: false })
      .order('ceaf_funcionarios(nome)', { ascending: true })
    setPedidos((data as CeafPedido[]) || [])
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (cicloSel) carregarPedidos(cicloSel)
  }, [cicloSel])

  async function marcarEntregue(pedidoId: string) {
    setSalvando(pedidoId)
    await getSupabase()
      .from('ceaf_pedidos')
      .update({ status: 'pago', pago_em: new Date().toISOString() })
      .eq('id', pedidoId)
    await carregarPedidos(cicloSel)
    setSalvando(null)
  }

  const cicloAtual = ciclos.find(c => c.id === cicloSel)

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  if (ciclos.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-gray-400 text-sm">Nenhum ciclo com pedidos fechados ainda.</p>
      <p className="text-xs text-gray-400">A vista de montagem aparece quando um ciclo é fechado ou consolidado.</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vista de Montagem</h1>
          {cicloAtual && (
            <p className="text-xs text-gray-400 mt-0.5">
              {cicloAtual.ceaf_empresas?.nome}
              {cicloAtual.data_entrega ? ` · Entrega ${fmtDate(cicloAtual.data_entrega)}` : ''}
              {cicloAtual.veiculo_sugerido ? ` · ${cicloAtual.veiculo_sugerido.replace('_', ' ').toUpperCase()}` : ''}
            </p>
          )}
        </div>
        <select
          value={cicloSel}
          onChange={e => setCicloSel(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740] bg-white"
        >
          {ciclos.map(c => (
            <option key={c.id} value={c.id}>
              {c.ceaf_empresas?.nome} — {c.data_entrega ? fmtDate(c.data_entrega) : c.semana_ref}
            </option>
          ))}
        </select>
      </div>

      {/* Filtro por slot */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setSlotSel('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${slotSel === 'todos' ? 'text-white' : 'border border-gray-200 bg-white text-gray-600'}`}
          style={slotSel === 'todos' ? { background: PRIMARY } : {}}>
          Todos ({pedidos.filter(p => p.status !== 'cancelado').length})
        </button>
        {slotsUsados.map(slot => {
          const count = pedidos.filter(p =>
            p.status !== 'cancelado' &&
            (slot === 'sem slot' ? !p.slot_retirada : p.slot_retirada === slot)
          ).length
          return (
            <button key={slot}
              onClick={() => setSlotSel(slot)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${slotSel === slot ? 'text-white' : 'border border-gray-200 bg-white text-gray-600'}`}
              style={slotSel === slot ? { background: PRIMARY } : {}}>
              {slot} ({count})
            </button>
          )
        })}
      </div>

      {/* Cards de pedido — otimizados para tablet */}
      {pedidosFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhum pedido neste filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {pedidosFiltrados.map(p => {
            const func = p.ceaf_funcionarios
            const itens = p.ceaf_pedidos_itens || []
            const entregue = p.status === 'pago'
            const carregando = salvando === p.id
            return (
              <div key={p.id}
                className={`rounded-xl border p-4 transition-all ${entregue ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-base">{func?.nome || '—'}</p>
                    {p.slot_retirada && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 mt-1 inline-block">
                        {p.slot_retirada}
                      </span>
                    )}
                  </div>
                  {entregue ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="text-xs font-bold">Entregue</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => marcarEntregue(p.id)}
                      disabled={carregando}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: PRIMARY }}>
                      {carregando ? '…' : 'Entregar'}
                    </button>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  {itens.map(item => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: PRIMARY }}>
                          {item.quantidade}
                        </span>
                        <span className="text-sm text-gray-700">{item.ceaf_produtos?.nome}</span>
                      </div>
                      <span className="text-xs text-gray-400">{item.ceaf_produtos?.unidade}</span>
                    </div>
                  ))}
                  {itens.length === 0 && (
                    <p className="text-xs text-gray-400">Sem itens registrados.</p>
                  )}
                </div>

                <div className="border-t border-gray-100 mt-3 pt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="text-sm font-bold text-gray-900">{fmtMoeda(p.valor_total)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
