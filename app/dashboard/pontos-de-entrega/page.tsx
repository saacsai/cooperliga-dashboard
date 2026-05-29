'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { PontoDeEntrega } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

type ContratoDropdown = { id: string; orgao: string; clientes: { nome: string } | null }

const VAZIO = { nome: '', contrato_id: '', codigo_interno: '', codigo_estado: '', codigo_prefeitura: '', endereco: '', municipio: '', contato_nome: '' }

export default function PontosDeEntregaPage() {
  const [pontos,    setPontos]   = useState<PontoDeEntrega[]>([])
  const [contratos, setContratos] = useState<ContratoDropdown[]>([])
  const [loading,   setLoading]  = useState(true)
  const [drawer,    setDrawer]   = useState(false)
  const [editId,    setEditId]   = useState<string | null>(null)
  const [salvando,  setSalvando] = useState(false)
  const [erro,      setErro]     = useState('')
  const [form,      setForm]     = useState(VAZIO)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const [{ data: p }, { data: c }] = await Promise.all([
      getSupabase().from('pontos_de_entrega').select('*, contratos(orgao, clientes(nome))').order('nome'),
      getSupabase().from('contratos').select('id, orgao, clientes(nome)').eq('ativo', true).order('orgao'),
    ])
    setPontos((p || []) as unknown as PontoDeEntrega[])
    setContratos((c || []) as unknown as ContratoDropdown[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(p: PontoDeEntrega) {
    setEditId(p.id)
    setForm({
      nome: p.nome, contrato_id: p.contrato_id || '', codigo_interno: p.codigo_interno || '',
      codigo_estado: p.codigo_estado || '', codigo_prefeitura: p.codigo_prefeitura || '',
      endereco: p.endereco || '', municipio: p.municipio || '', contato_nome: p.contato_nome || '',
    })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome: form.nome,
      contrato_id: form.contrato_id || null,
      codigo_interno: form.codigo_interno || null,
      codigo_estado: form.codigo_estado || null,
      codigo_prefeitura: form.codigo_prefeitura || null,
      endereco: form.endereco || null,
      municipio: form.municipio || null,
      contato_nome: form.contato_nome || null,
    }
    const { error } = editId
      ? await getSupabase().from('pontos_de_entrega').update(payload).eq('id', editId)
      : await getSupabase().from('pontos_de_entrega').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function toggleAtivo(p: PontoDeEntrega) {
    await getSupabase().from('pontos_de_entrega').update({ ativo: !p.ativo }).eq('id', p.id)
    carregar()
  }

  function labelContrato(c: ContratoDropdown) {
    const cliente = (c as any).clientes?.nome || ''
    return `${c.orgao}${cliente ? ` — ${cliente}` : ''}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pontos de Entrega</h1>
          <p className="text-sm text-gray-500 mt-0.5">Escolas, creches e unidades receptoras</p>
        </div>
        <button onClick={abrirNovo} className="text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
          + Novo ponto
        </button>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contrato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Prefeitura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Município</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pontos.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{(p as any).contratos?.orgao || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.codigo_estado || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.codigo_prefeitura || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.municipio || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(p)} className="text-xs text-gray-400 hover:text-gray-700">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pontos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum ponto de entrega cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar ponto de entrega' : 'Novo ponto de entrega'} width={480}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contrato</label>
            <select value={form.contrato_id} onChange={set('contrato_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
              <option value="">Sem contrato</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{labelContrato(c)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Estado (CIE)</label>
              <input type="text" value={form.codigo_estado} onChange={set('codigo_estado')} placeholder="ex: 923370"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Prefeitura</label>
              <input type="text" value={form.codigo_prefeitura} onChange={set('codigo_prefeitura')} placeholder="ex: 12716"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Interno</label>
              <input type="text" value={form.codigo_interno} onChange={set('codigo_interno')} placeholder="ex: R03-04"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
              <input type="text" value={form.municipio} onChange={set('municipio')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
            <input type="text" value={form.endereco} onChange={set('endereco')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contato</label>
            <input type="text" value={form.contato_nome} onChange={set('contato_nome')}
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
