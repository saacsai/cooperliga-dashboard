'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { CeafProduto, CeafCardapio } from '@/lib/supabase'

const PRIMARY = '#072740'

const CATEGORIAS: Record<string, { label: string; cor: string }> = {
  folhosa:    { label: 'Folhosa',    cor: 'bg-green-100 text-green-700' },
  legume:     { label: 'Legume',     cor: 'bg-yellow-100 text-yellow-700' },
  fruta:      { label: 'Fruta',      cor: 'bg-orange-100 text-orange-700' },
  grao:       { label: 'Grão',       cor: 'bg-amber-100 text-amber-700' },
  processado: { label: 'Processado', cor: 'bg-purple-100 text-purple-700' },
  outro:      { label: 'Outro',      cor: 'bg-gray-100 text-gray-600' },
}

function getMondayStr(offset = 0): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offset * 7)
  return d.toISOString().split('T')[0]
}

function fmtSemana(s: string) {
  const d = new Date(s + 'T12:00:00')
  const fim = new Date(s + 'T12:00:00')
  fim.setDate(fim.getDate() + 4)
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }
  return `${d.toLocaleDateString('pt-BR', opts)} – ${fim.toLocaleDateString('pt-BR', opts)}`
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const VAZIO_PROD = { nome: '', categoria: 'legume' as CeafProduto['categoria'], unidade: 'unidade', preco_unitario: '' }

export default function CardapioPage() {
  const [produtos,      setProdutos]      = useState<CeafProduto[]>([])
  const [cardapio,      setCardapio]      = useState<CeafCardapio[]>([])
  const [loading,       setLoading]       = useState(true)
  const [semana,        setSemana]        = useState(getMondayStr)
  const [drawerProd,    setDrawerProd]    = useState(false)
  const [drawerAdd,     setDrawerAdd]     = useState(false)
  const [editProdId,    setEditProdId]    = useState<string | null>(null)
  const [salvando,      setSalvando]      = useState(false)
  const [erro,          setErro]          = useState('')
  const [formProd,      setFormProd]      = useState(VAZIO_PROD)
  const [qtdMap,        setQtdMap]        = useState<Record<string, string>>({})
  const [precoMap,      setPrecoMap]      = useState<Record<string, string>>({})
  const [addSelecionados, setAddSelecionados] = useState<Set<string>>(new Set())

  const cardapioSemana = useMemo(() =>
    cardapio.filter(c => c.semana_ref === semana && c.ativo)
  , [cardapio, semana])

  const produtosNoCardapio = useMemo(() =>
    new Set(cardapioSemana.map(c => c.produto_id))
  , [cardapioSemana])

  const produtosDisponiveis = useMemo(() =>
    produtos.filter(p => p.disponivel && !produtosNoCardapio.has(p.id))
  , [produtos, produtosNoCardapio])

  const setP = (f: keyof typeof VAZIO_PROD) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormProd(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const sb = getSupabase()
    const [{ data: prods }, { data: card }] = await Promise.all([
      sb.from('ceaf_produtos').select('*').order('categoria').order('nome'),
      sb.from('ceaf_cardapio').select('*, ceaf_produtos(*)').order('semana_ref', { ascending: false }),
    ])
    setProdutos(prods || [])
    setCardapio((card as CeafCardapio[]) || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    const map: Record<string, string> = {}
    const pmap: Record<string, string> = {}
    cardapioSemana.forEach(c => {
      map[c.produto_id] = String(c.quantidade_cx ?? '')
      pmap[c.produto_id] = String(c.preco_semana ?? c.ceaf_produtos?.preco_unitario ?? '')
    })
    setQtdMap(map)
    setPrecoMap(pmap)
  }, [cardapioSemana])

  async function handleSalvarProduto(ev: React.FormEvent) {
    ev.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome: formProd.nome.trim(),
      categoria: formProd.categoria,
      unidade: formProd.unidade.trim() || 'unidade',
      preco_unitario: parseFloat(formProd.preco_unitario) || 0,
    }
    const sb = getSupabase()
    const { error } = editProdId
      ? await sb.from('ceaf_produtos').update(payload).eq('id', editProdId)
      : await sb.from('ceaf_produtos').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    await carregar(); setSalvando(false); setDrawerProd(false)
  }

  async function adicionarAoCardapio() {
    if (addSelecionados.size === 0) return
    setSalvando(true)
    const inserts = Array.from(addSelecionados).map(prodId => {
      const prod = produtos.find(p => p.id === prodId)
      return { semana_ref: semana, produto_id: prodId, preco_semana: prod?.preco_unitario ?? null }
    })
    await getSupabase().from('ceaf_cardapio').insert(inserts)
    await carregar(); setSalvando(false); setDrawerAdd(false); setAddSelecionados(new Set())
  }

  async function removerDoCardapio(c: CeafCardapio) {
    await getSupabase().from('ceaf_cardapio').update({ ativo: false }).eq('id', c.id)
    carregar()
  }

  async function atualizarQtd(c: CeafCardapio, qtd: string) {
    const v = qtd === '' ? null : parseInt(qtd)
    await getSupabase().from('ceaf_cardapio').update({ quantidade_cx: v }).eq('id', c.id)
  }

  async function atualizarPreco(c: CeafCardapio, preco: string) {
    const v = preco === '' ? null : parseFloat(preco)
    await getSupabase().from('ceaf_cardapio').update({ preco_semana: v }).eq('id', c.id)
  }

  function abrirNovoProd() {
    setEditProdId(null); setFormProd(VAZIO_PROD); setErro(''); setDrawerProd(true)
  }

  function abrirEditarProd(p: CeafProduto) {
    setEditProdId(p.id)
    setFormProd({ nome: p.nome, categoria: p.categoria, unidade: p.unidade, preco_unitario: String(p.preco_unitario) })
    setErro(''); setDrawerProd(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cardápio Semanal</h1>
          <p className="text-xs text-gray-400 mt-0.5">Produtos disponíveis para pedido nesta semana</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSemana(getMondayStr(-1))} className="p-2 rounded-lg hover:bg-white border border-gray-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
            {fmtSemana(semana)}
          </div>
          <button onClick={() => setSemana(getMondayStr(1))} className="p-2 rounded-lg hover:bg-white border border-gray-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button onClick={() => setDrawerAdd(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: PRIMARY }}>
            + Adicionar produto
          </button>
          <button onClick={abrirNovoProd}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700">
            Cadastrar produto
          </button>
        </div>
      </div>

      {cardapioSemana.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhum produto no cardápio desta semana.</p>
          <button onClick={() => setDrawerAdd(true)} className="mt-3 text-sm font-medium" style={{ color: PRIMARY }}>
            Montar cardápio →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd. Cx</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço (R$)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cardapioSemana.map(c => {
                const prod = c.ceaf_produtos
                const cat = CATEGORIAS[prod?.categoria || 'outro']
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{prod?.nome}</p>
                      <p className="text-xs text-gray-400">{prod?.unidade}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.cor}`}>{cat.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number" min="0"
                        value={qtdMap[c.produto_id] ?? ''}
                        onChange={e => setQtdMap(m => ({ ...m, [c.produto_id]: e.target.value }))}
                        onBlur={e => atualizarQtd(c, e.target.value)}
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#072740]"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number" min="0" step="0.01"
                        value={precoMap[c.produto_id] ?? ''}
                        onChange={e => setPrecoMap(m => ({ ...m, [c.produto_id]: e.target.value }))}
                        onBlur={e => atualizarPreco(c, e.target.value)}
                        className="w-24 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#072740]"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removerDoCardapio(c)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                        Remover
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer: adicionar produto ao cardápio */}
      <Drawer open={drawerAdd} onClose={() => { setDrawerAdd(false); setAddSelecionados(new Set()) }} title="Adicionar ao cardápio">
        <div className="space-y-3">
          {produtosDisponiveis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Todos os produtos disponíveis já estão nesta semana.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500">Selecione os produtos para esta semana:</p>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {produtosDisponiveis.map(p => {
                  const sel = addSelecionados.has(p.id)
                  const cat = CATEGORIAS[p.categoria]
                  return (
                    <label key={p.id} className={`flex items-center gap-3 py-3 cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded ${sel ? 'bg-[#eef6fc]' : ''}`}>
                      <input type="checkbox" checked={sel}
                        onChange={() => {
                          const s = new Set(addSelecionados)
                          sel ? s.delete(p.id) : s.add(p.id)
                          setAddSelecionados(s)
                        }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cat.cor}`}>{cat.label}</span>
                          <span className="text-xs text-gray-400">{fmtMoeda(p.preco_unitario)}</span>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="pt-2 border-t border-gray-100">
                <button onClick={adicionarAoCardapio} disabled={addSelecionados.size === 0 || salvando}
                  className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-brand">
                  {salvando ? 'Adicionando…' : `Adicionar ${addSelecionados.size > 0 ? `(${addSelecionados.size})` : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </Drawer>

      {/* Drawer: cadastrar/editar produto */}
      <Drawer open={drawerProd} onClose={() => setDrawerProd(false)} title={editProdId ? 'Editar produto' : 'Novo produto CEAF'}>
        <form onSubmit={handleSalvarProduto} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={formProd.nome} onChange={setP('nome')} required autoFocus
              placeholder="ex: Alface crespa, Mel de abelha…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoria *</label>
            <select value={formProd.categoria} onChange={setP('categoria')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]">
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidade</label>
            <input type="text" value={formProd.unidade} onChange={setP('unidade')}
              placeholder="unidade, kg, maço, cx…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Preço padrão (R$)</label>
            <input type="number" min="0" step="0.01" value={formProd.preco_unitario} onChange={setP('preco_unitario')}
              placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
          </div>
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawerProd(false)}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-brand">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>

        {/* Lista de todos os produtos cadastrados */}
        {!editProdId && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Todos os produtos</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {produtos.map(p => (
                <div key={p.id} className={`flex items-center gap-2 py-1.5 ${!p.disponivel ? 'opacity-40' : ''}`}>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${CATEGORIAS[p.categoria]?.cor}`}>
                    {CATEGORIAS[p.categoria]?.label}
                  </span>
                  <span className="text-sm flex-1 text-gray-700">{p.nome}</span>
                  <span className="text-xs text-gray-400">{fmtMoeda(p.preco_unitario)}</span>
                  <button onClick={() => abrirEditarProd(p)}
                    className="text-xs text-gray-400 hover:text-gray-700 px-1">
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
