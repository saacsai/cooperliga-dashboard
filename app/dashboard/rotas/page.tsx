'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import type { Rota } from '@/lib/supabase'

type AgregadoDropdown = { id: string; nome: string }

const PRIMARY = '#5C0F0F'

const VAZIO = { codigo: '', nome: '', regiao: '', agregado_id: '', valor_frete: '' }

const COLUNAS_IMPORT = [
  { key: 'codigo',      label: 'Código' },
  { key: 'nome',        label: 'Nome' },
  { key: 'regiao',      label: 'Região' },
  { key: 'valor_frete', label: 'Valor Frete' },
]

export default function RotasPage() {
  const [rotas,    setRotas]    = useState<Rota[]>([])
  const [agregados, setAgregados] = useState<AgregadoDropdown[]>([])
  const [loading,  setLoading]  = useState(true)
  const [drawer,   setDrawer]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')
  const [form,     setForm]     = useState(VAZIO)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const [{ data: r }, { data: a }] = await Promise.all([
      getSupabase().from('rotas').select('*, agregados(nome)').order('codigo'),
      getSupabase().from('agregados').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setRotas((r || []) as unknown as Rota[])
    setAgregados((a || []) as unknown as AgregadoDropdown[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(r: Rota) {
    setEditId(r.id)
    setForm({ codigo: r.codigo, nome: r.nome, regiao: r.regiao || '', agregado_id: r.agregado_id || '', valor_frete: r.valor_frete?.toString() || '' })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      codigo: form.codigo,
      nome: form.nome,
      regiao: form.regiao || null,
      agregado_id: form.agregado_id || null,
      valor_frete: form.valor_frete ? parseFloat(form.valor_frete) : null,
    }
    const { error } = editId
      ? await getSupabase().from('rotas').update(payload).eq('id', editId)
      : await getSupabase().from('rotas').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const payload = rows.filter(r => r.codigo && r.nome).map(r => ({
      codigo:      r.codigo,
      nome:        r.nome,
      regiao:      r.regiao      || null,
      valor_frete: r.valor_frete ? parseFloat(r.valor_frete.replace(',', '.')) : null,
    }))
    const { error } = await getSupabase()
      .from('rotas')
      .upsert(payload, { onConflict: 'codigo' })
    if (error) throw new Error(error.message)
    carregar()
  }

  async function toggleAtivo(r: Rota) {
    await getSupabase().from('rotas').update({ ativo: !r.ativo }).eq('id', r.id)
    carregar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rotas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Roteiros de entrega com agregado e valor de frete</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Nova rota
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Região</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Agregado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Frete</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rotas.map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{r.codigo}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{r.regiao || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{(r as any).agregados?.nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.valor_frete ? `R$ ${r.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(r)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(r)} className="text-xs text-gray-400 hover:text-gray-700">{r.ativo ? 'Desativar' : 'Ativar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rotas.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma rota cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar rota' : 'Nova rota'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
              <input type="text" value={form.codigo} onChange={set('codigo')} required autoFocus placeholder="ex: R01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Região</label>
              <input type="text" value={form.regiao} onChange={set('regiao')} placeholder="ex: Santo André"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required placeholder="ex: Rota Santo André Norte"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Agregado</label>
            <select value={form.agregado_id} onChange={set('agregado_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
              <option value="">Sem agregado</option>
              {agregados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor do frete (R$)</label>
            <input type="number" step="0.01" value={form.valor_frete} onChange={set('valor_frete')} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50" style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
