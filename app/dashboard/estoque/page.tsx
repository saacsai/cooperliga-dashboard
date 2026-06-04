'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { EstoqueMovimento, TipoMovimento } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const HOJE = new Date().toISOString().split('T')[0]

type DropItem = { id: string; nome: string }

const TIPO_CONFIG: Record<TipoMovimento, { label: string; badge: string; direcao: 'entrada' | 'saida' | 'ambos' }> = {
  recebimento: { label: 'Recebimento',   badge: 'bg-green-100 text-green-700',   direcao: 'entrada' },
  distribuicao:{ label: 'Distribuição',  badge: 'bg-blue-100 text-blue-700',     direcao: 'saida'   },
  retorno:     { label: 'Retorno Vazia', badge: 'bg-teal-100 text-teal-700',     direcao: 'entrada' },
  retirada:    { label: 'Retirada',      badge: 'bg-purple-100 text-purple-700', direcao: 'saida'   },
  venda:       { label: 'Venda',         badge: 'bg-orange-100 text-orange-700', direcao: 'saida'   },
  ajuste:      { label: 'Ajuste',        badge: 'bg-gray-100 text-gray-600',     direcao: 'ambos'   },
}

const TIPOS_COM_MANIFESTO: TipoMovimento[] = ['distribuicao', 'retorno']

const VAZIO = {
  data:            HOJE,
  tipo:            'recebimento' as TipoMovimento,
  cliente_id:      '',
  manifestoNumero: '',
  quantidade:      '',
  direcao:         'entrada' as 'entrada' | 'saida',
  observacao:      '',
}

export default function EstoquePage() {
  const [movimentos,  setMovimentos]  = useState<EstoqueMovimento[]>([])
  const [clientes,    setClientes]    = useState<DropItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [drawer,      setDrawer]      = useState(false)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [form,        setForm]        = useState(VAZIO)

  // Manifesto lookup
  const [manifestoId,     setManifestoId]     = useState<string | null>(null)
  const [manifestoStatus, setManifestoStatus] = useState<'idle' | 'found' | 'not_found'>('idle')
  const [buscandoManif,   setBuscandoManif]   = useState(false)

  const [filtroCliente, setFiltroCliente] = useState('')

  async function carregar() {
    const [{ data: mov }, { data: cli }] = await Promise.all([
      getSupabase()
        .from('estoque_movimentos')
        .select('*, clientes(nome), ciclo_manifestos(numero_base, letra)')
        .order('data', { ascending: true })
        .order('created_at', { ascending: true }),
      getSupabase().from('clientes').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setMovimentos((mov || []) as unknown as EstoqueMovimento[])
    setClientes((cli || []) as DropItem[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  // ── Saldo por cliente (para validação) ───────────────────────────────────
  const saldoPorCliente = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of movimentos) {
      if (!m.cliente_id) continue
      map[m.cliente_id] = (map[m.cliente_id] ?? 0) + m.entrada - m.saida
    }
    return map
  }, [movimentos])

  // ── Filtro + saldo acumulado ──────────────────────────────────────────────
  const linhas = useMemo(() => {
    const list = filtroCliente
      ? movimentos.filter(m => m.cliente_id === filtroCliente)
      : movimentos
    let saldo = 0
    return list.map(m => {
      saldo += m.entrada - m.saida
      return { ...m, saldo }
    })
  }, [movimentos, filtroCliente])

  const saldoAtual = linhas.length > 0 ? linhas[linhas.length - 1].saldo : 0

  // ── Manifesto lookup (ao sair do campo) ──────────────────────────────────
  async function buscarManifesto(texto: string) {
    const t = texto.trim()
    if (!t) { setManifestoId(null); setManifestoStatus('idle'); return }
    const num = parseInt(t)
    if (isNaN(num)) { setManifestoId(null); setManifestoStatus('not_found'); return }
    const letra = t.replace(/\d/g, '').toUpperCase() || 'A'
    setBuscandoManif(true)
    const { data } = await getSupabase()
      .from('ciclo_manifestos')
      .select('id, numero, letra, data_entrega')
      .eq('numero', num)
      .eq('letra', letra)
      .limit(1)
    setBuscandoManif(false)
    if (data && data[0]) {
      setManifestoId(data[0].id)
      setManifestoStatus('found')
    } else {
      setManifestoId(null)
      setManifestoStatus('not_found')
    }
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  function abrirNovo() {
    setForm(VAZIO)
    setManifestoId(null)
    setManifestoStatus('idle')
    setErro('')
    setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const cfg = TIPO_CONFIG[form.tipo]
    const qty = parseInt(form.quantidade) || 0
    if (qty <= 0) { setErro('Quantidade deve ser maior que zero'); setSalvando(false); return }

    if (form.data > HOJE) {
      setErro('Não é permitido lançamento com data futura.'); setSalvando(false); return
    }

    let entrada = 0, saida = 0
    if (cfg.direcao === 'entrada') entrada = qty
    else if (cfg.direcao === 'saida') saida = qty
    else if (form.direcao === 'entrada') entrada = qty
    else saida = qty

    if (saida > 0 && form.tipo !== 'ajuste' && form.cliente_id) {
      const saldoCliente = saldoPorCliente[form.cliente_id] ?? 0
      if (saida > saldoCliente) {
        const nomeCliente = clientes.find(c => c.id === form.cliente_id)?.nome ?? 'este cliente'
        setErro(`Saldo insuficiente: ${nomeCliente} tem ${saldoCliente} cx. Não é possível registrar saída de ${saida} cx.`)
        setSalvando(false); return
      }
    }

    const { data: { session } } = await getSupabase().auth.getSession()

    const payload = {
      data:         form.data,
      tipo:         form.tipo,
      cliente_id:   form.cliente_id || null,
      manifesto_id: manifestoId     || null,
      entrada,
      saida,
      observacao:   form.observacao || null,
      created_by:   session?.user.id || null,
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

  const cfg = TIPO_CONFIG[form.tipo]

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Estoque de Caixas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Conta corrente de caixas por cliente</p>
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

        {filtroCliente && (
          <button onClick={() => setFiltroCliente('')} className="text-xs text-gray-400 hover:text-gray-700">
            Limpar filtro
          </button>
        )}

        <div className="ml-auto text-right">
          <p className="text-xs text-gray-500">{filtroCliente ? 'Saldo filtrado' : 'Saldo no galpão'}</p>
          <p className={`text-base font-bold ${saldoAtual < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {saldoAtual} cx
          </p>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Manifesto</th>
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
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {(m as any).ciclo_manifestos
                        ? `#${String((m as any).ciclo_manifestos.numero_base).padStart(4,'0')}${(m as any).ciclo_manifestos.letra}`
                        : '—'}
                    </td>
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
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">
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
                    {filtroCliente ? 'Nenhum lançamento para este cliente.' : 'Nenhum lançamento registrado.'}
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
              <input type="date" value={form.data} onChange={set('data')} required max={HOJE}
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
              Cliente {cfg.direcao !== 'ambos' ? '*' : ''}
            </label>
            <select value={form.cliente_id} onChange={set('cliente_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              <option value="">Selecione…</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome}{saldoPorCliente[c.id] !== undefined ? ` (${saldoPorCliente[c.id]} cx)` : ''}
                </option>
              ))}
            </select>
          </div>

          {TIPOS_COM_MANIFESTO.includes(form.tipo) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº do manifesto</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.manifestoNumero}
                  onChange={e => {
                    set('manifestoNumero')(e)
                    setManifestoStatus('idle')
                    setManifestoId(null)
                  }}
                  onBlur={e => buscarManifesto(e.target.value)}
                  placeholder="ex: 42A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono"
                />
                {buscandoManif && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando…</span>
                )}
              </div>
              {manifestoStatus === 'found' && (
                <p className="text-xs text-green-600 mt-1">✓ Manifesto encontrado e vinculado</p>
              )}
              {manifestoStatus === 'not_found' && (
                <p className="text-xs text-amber-600 mt-1">Manifesto não encontrado — será salvo sem vínculo</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade *</label>
            <input type="number" min="1" value={form.quantidade} onChange={set('quantidade')} required
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
