'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { EstoqueMovimento, TipoMovimento } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

type DropItem = { id: string; nome: string }
type ManifestoItem = { id: string; numero: number; variante: string | null; data_entrega: string }

const TIPO_CONFIG: Record<TipoMovimento, { label: string; badge: string; direcao: 'entrada' | 'saida' | 'ambos' }> = {
  recebimento: { label: 'Recebimento',   badge: 'bg-green-100 text-green-700',   direcao: 'entrada' },
  distribuicao:{ label: 'Distribuição',  badge: 'bg-blue-100 text-blue-700',     direcao: 'saida'   },
  retorno:     { label: 'Retorno Vazia', badge: 'bg-teal-100 text-teal-700',     direcao: 'entrada' },
  retirada:    { label: 'Retirada',      badge: 'bg-purple-100 text-purple-700', direcao: 'saida'   },
  venda:       { label: 'Venda',         badge: 'bg-orange-100 text-orange-700', direcao: 'saida'   },
  ajuste:      { label: 'Ajuste',        badge: 'bg-gray-100 text-gray-600',     direcao: 'ambos'   },
}

const TIPOS_REQUER_AGREGADO: TipoMovimento[] = ['distribuicao', 'retorno']

const VAZIO = {
  data:         new Date().toISOString().split('T')[0],
  tipo:         'recebimento' as TipoMovimento,
  cliente_id:   '',
  agregado_id:  '',
  manifesto_id: '',
  quantidade:   '',
  direcao:      'entrada' as 'entrada' | 'saida',
  observacao:   '',
}

export default function EstoquePage() {
  const [movimentos,  setMovimentos]  = useState<EstoqueMovimento[]>([])
  const [clientes,    setClientes]    = useState<DropItem[]>([])
  const [agregados,   setAgregados]   = useState<DropItem[]>([])
  const [manifestos,  setManifestos]  = useState<ManifestoItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [drawer,      setDrawer]      = useState(false)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [form,        setForm]        = useState(VAZIO)

  // Filtros
  const [filtroCliente,  setFiltroCliente]  = useState('')
  const [filtroAgregado, setFiltroAgregado] = useState('')

  async function carregar() {
    const [{ data: mov }, { data: cli }, { data: agr }, { data: man }] = await Promise.all([
      getSupabase()
        .from('estoque_movimentos')
        .select('*, clientes(nome), agregados(nome)')
        .order('data', { ascending: true })
        .order('created_at', { ascending: true }),
      getSupabase().from('clientes').select('id, nome').eq('ativo', true).order('nome'),
      getSupabase().from('agregados').select('id, nome').eq('ativo', true).order('nome'),
      getSupabase().from('ciclo_manifestos')
        .select('id, numero, variante, data_entrega')
        .order('data_entrega', { ascending: false })
        .limit(120),
    ])
    setMovimentos((mov || []) as unknown as EstoqueMovimento[])
    setClientes((cli || []) as DropItem[])
    setAgregados((agr || []) as DropItem[])
    setManifestos((man || []) as unknown as ManifestoItem[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  // ── Filtros + saldo acumulado ─────────────────────────────────────────────
  const linhas = useMemo(() => {
    let list = movimentos
    if (filtroCliente)  list = list.filter(m => m.cliente_id  === filtroCliente)
    if (filtroAgregado) list = list.filter(m => m.agregado_id === filtroAgregado)
    let saldo = 0
    return list.map(m => {
      saldo += m.entrada - m.saida
      return { ...m, saldo }
    })
  }, [movimentos, filtroCliente, filtroAgregado])

  const saldoAtual = linhas.length > 0 ? linhas[linhas.length - 1].saldo : 0

  // ── Débito por agregado (sem filtro de cliente) ───────────────────────────
  const debitoAgregado = useMemo(() => {
    if (!filtroAgregado) return null
    const movAgr = movimentos.filter(m => m.agregado_id === filtroAgregado)
    return movAgr.reduce((acc, m) => acc + m.saida - m.entrada, 0)
  }, [movimentos, filtroAgregado])

  // ── Form helpers ──────────────────────────────────────────────────────────
  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  function abrirNovo() {
    setForm(VAZIO); setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const cfg = TIPO_CONFIG[form.tipo]
    const qty = parseInt(form.quantidade) || 0
    if (qty <= 0) { setErro('Quantidade deve ser maior que zero'); setSalvando(false); return }

    let entrada = 0, saida = 0
    if (cfg.direcao === 'entrada') entrada = qty
    else if (cfg.direcao === 'saida') saida = qty
    else if (form.direcao === 'entrada') entrada = qty
    else saida = qty

    const { data: { session } } = await getSupabase().auth.getSession()

    const payload = {
      data:         form.data,
      tipo:         form.tipo,
      cliente_id:   form.cliente_id   || null,
      agregado_id:  form.agregado_id  || null,
      manifesto_id: form.manifesto_id || null,
      entrada,
      saida,
      observacao:   form.observacao   || null,
      created_by:   session?.user.id  || null,
    }

    const { error } = await getSupabase().from('estoque_movimentos').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este lançamento? Esta ação não pode ser desfeita.')) return
    await getSupabase().from('estoque_movimentos').delete().eq('id', id)
    carregar()
  }

  const temFiltro = !!(filtroCliente || filtroAgregado)
  const cfg = TIPO_CONFIG[form.tipo]

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Estoque de Caixas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Conta corrente de caixas por cliente e agregado</p>
        </div>
        <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
          + Novo lançamento
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C0F0F] bg-white">
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        <select value={filtroAgregado} onChange={e => setFiltroAgregado(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C0F0F] bg-white">
          <option value="">Todos os agregados</option>
          {agregados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>

        {temFiltro && (
          <button onClick={() => { setFiltroCliente(''); setFiltroAgregado('') }}
            className="text-xs text-gray-400 hover:text-gray-700">
            Limpar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-4">
          {debitoAgregado !== null && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Débito agregado</p>
              <p className={`text-base font-bold ${debitoAgregado > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {debitoAgregado > 0 ? `${debitoAgregado} cx a devolver` : 'Quitado'}
              </p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-gray-500">{temFiltro ? 'Saldo filtrado' : 'Saldo no galpão'}</p>
            <p className={`text-base font-bold ${saldoAtual < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {saldoAtual} cx
            </p>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Data</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Agregado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-green-700">Entrada</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-red-600">Saída</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Saldo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Obs</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {linhas.map(m => {
                const tc = TIPO_CONFIG[m.tipo as TipoMovimento]
                return (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-600 tabular-nums text-xs">
                      {new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.badge}`}>
                        {tc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{m.clientes?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.agregados?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.entrada > 0
                        ? <span className="text-green-700 font-medium">{m.entrada}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {m.saida > 0
                        ? <span className="text-red-600 font-medium">{m.saida}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold text-xs ${(m as any).saldo < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {(m as any).saldo}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">
                      {m.observacao || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleExcluir(m.id)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                    </td>
                  </tr>
                )
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                    {temFiltro ? 'Nenhum lançamento para este filtro.' : 'Nenhum lançamento registrado.'}
                  </td>
                </tr>
              )}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold text-green-700">
                    {linhas.reduce((a, m) => a + m.entrada, 0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold text-red-600">
                    {linhas.reduce((a, m) => a + m.saida, 0)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums text-xs font-bold ${saldoAtual < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {saldoAtual}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Drawer novo lançamento */}
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Novo lançamento">
        <form onSubmit={handleSalvar} className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data *</label>
              <input type="date" value={form.data} onChange={set('data')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
              <select value={form.tipo} onChange={set('tipo')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                {(Object.keys(TIPO_CONFIG) as TipoMovimento[]).map(t => (
                  <option key={t} value={t}>{TIPO_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cliente {cfg.direcao !== 'ambos' && form.tipo !== 'venda' ? '*' : ''}
            </label>
            <select value={form.cliente_id} onChange={set('cliente_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              <option value="">Selecione…</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {TIPOS_REQUER_AGREGADO.includes(form.tipo) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agregado *</label>
              <select value={form.agregado_id} onChange={set('agregado_id')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="">Selecione…</option>
                {agregados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          )}

          {TIPOS_REQUER_AGREGADO.includes(form.tipo) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Manifesto (referência)</label>
              <select value={form.manifesto_id} onChange={set('manifesto_id')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="">Sem vínculo</option>
                {manifestos.map(m => (
                  <option key={m.id} value={m.id}>
                    #{m.numero}{m.variante || 'A'} — {new Date(m.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade *</label>
            <input type="number" min="1" value={form.quantidade} onChange={set('quantidade')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          {cfg.direcao === 'ambos' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Direção do ajuste</label>
              <div className="flex gap-4">
                {(['entrada', 'saida'] as const).map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="direcao" value={d} checked={form.direcao === d}
                      onChange={() => setForm(p => ({ ...p, direcao: d }))}
                      className="accent-[#5C0F0F]" />
                    <span className="text-sm text-gray-700">{d === 'entrada' ? '+ Entrada' : '− Saída'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <textarea value={form.observacao} onChange={set('observacao')} rows={2}
              placeholder="Ex: 4 cx a mais do pedido, 1 cx emprestada para unidade 12176…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] resize-none" />
          </div>

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)}
              className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
