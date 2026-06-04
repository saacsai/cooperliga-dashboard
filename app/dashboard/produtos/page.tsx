'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import type { Produto } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const VAZIO = { nome: '', unidade_padrao: 'UNIDADE' as 'UNIDADE' | 'CAIXA' | 'PACOTE', capacidade_por_caixa: '', categoria: '' }

const COLUNAS_IMPORT = [
  { key: 'nome',                label: 'Nome' },
  { key: 'unidade_padrao',      label: 'Unidade' },
  { key: 'capacidade_por_caixa', label: 'Cap. por caixa' },
  { key: 'categoria',           label: 'Categoria' },
]

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading,  setLoading]  = useState(true)
  const [drawer,   setDrawer]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')
  const [form,     setForm]     = useState(VAZIO)

  async function carregar() {
    const { data } = await getSupabase().from('produtos').select('*').order('nome')
    setProdutos(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(p: Produto) {
    setEditId(p.id)
    setForm({ nome: p.nome, unidade_padrao: p.unidade_padrao, capacidade_por_caixa: p.capacidade_por_caixa?.toString() || '', categoria: p.categoria || '' })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome: form.nome,
      unidade_padrao: form.unidade_padrao,
      capacidade_por_caixa: form.capacidade_por_caixa ? parseInt(form.capacidade_por_caixa) : null,
      categoria: form.categoria || null,
    }
    const { error } = editId
      ? await getSupabase().from('produtos').update(payload).eq('id', editId)
      : await getSupabase().from('produtos').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const UNIDADES = ['UNIDADE', 'CAIXA', 'PACOTE']
    const payload = rows.filter(r => r.nome).map(r => ({
      nome:                 r.nome,
      unidade_padrao:       (UNIDADES.includes(r.unidade_padrao?.toUpperCase()) ? r.unidade_padrao.toUpperCase() : 'UNIDADE') as 'UNIDADE' | 'CAIXA' | 'PACOTE',
      capacidade_por_caixa: r.capacidade_por_caixa ? parseInt(r.capacidade_por_caixa) : null,
      categoria:            r.categoria || null,
    }))
    const { error } = await getSupabase().from('produtos').insert(payload)
    if (error) throw new Error(error.message)
    carregar()
  }

  async function handleExcluir(p: Produto) {
    if (!confirm(`Excluir o produto "${p.nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await getSupabase().from('produtos').delete().eq('id', p.id)
    if (error) {
      alert(error.message.includes('foreign key')
        ? `Não é possível excluir "${p.nome}" pois existem entregas vinculadas.`
        : `Erro ao excluir: ${error.message}`)
      return
    }
    setProdutos(prev => prev.filter(x => x.id !== p.id))
  }

  async function toggleAtivo(p: Produto) {
    await getSupabase().from('produtos').update({ ativo: !p.ativo }).eq('id', p.id)
    carregar()
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gêneros alimentícios e itens entregues</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Novo produto
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Unidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cap. por caixa</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {produtos.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.unidade_padrao}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.capacidade_por_caixa ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.categoria || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(p)} className="text-xs text-gray-400 hover:text-gray-700">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                      <button onClick={() => handleExcluir(p)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {produtos.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar produto' : 'Novo produto'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} required autoFocus
              placeholder="ex: BANANA PRATA AF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidade padrão *</label>
            <select value={form.unidade_padrao} onChange={e => setForm(p => ({ ...p, unidade_padrao: e.target.value as typeof form.unidade_padrao }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
              <option value="UNIDADE">Unidade</option>
              <option value="CAIXA">Caixa</option>
              <option value="PACOTE">Pacote</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Capacidade por caixa</label>
            <input type="number" value={form.capacidade_por_caixa} onChange={e => setForm(p => ({ ...p, capacidade_por_caixa: e.target.value }))}
              placeholder="ex: 180 (para banana)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
            <input type="text" value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
              placeholder="ex: Fruta, Verdura, Grão"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)} className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
