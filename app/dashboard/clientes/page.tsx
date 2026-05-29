'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { Cliente } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const VAZIO = { nome: '', cnpj: '', codigo: '', contato_nome: '', contato_whatsapp: '' }

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading,  setLoading]  = useState(true)
  const [drawer,   setDrawer]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')
  const [form,     setForm]     = useState(VAZIO)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const { data } = await getSupabase().from('clientes').select('*').order('nome')
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(c: Cliente) {
    setEditId(c.id)
    setForm({ nome: c.nome, cnpj: c.cnpj || '', codigo: c.codigo || '', contato_nome: c.contato_nome || '', contato_whatsapp: c.contato_whatsapp || '' })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const db = getSupabase()
    const payload = { nome: form.nome, cnpj: form.cnpj || null, codigo: form.codigo || null, contato_nome: form.contato_nome || null, contato_whatsapp: form.contato_whatsapp || null }
    const { error } = editId
      ? await db.from('clientes').update(payload).eq('id', editId)
      : await db.from('clientes').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function toggleAtivo(c: Cliente) {
    await getSupabase().from('clientes').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cooperativas e associações que contratam a CooperLiga</p>
        </div>
        <button onClick={abrirNovo} className="text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
          + Novo cliente
        </button>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">CNPJ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{c.codigo || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.cnpj || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.contato_nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(c)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(c)} className="text-xs text-gray-400 hover:text-gray-700">{c.ativo ? 'Desativar' : 'Ativar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum cliente cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar cliente' : 'Novo cliente'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
            <input type="text" value={form.codigo} onChange={set('codigo')} placeholder="ex: 01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
            <input type="text" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do contato</label>
            <input type="text" value={form.contato_nome} onChange={set('contato_nome')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp do contato</label>
            <input type="tel" value={form.contato_whatsapp} onChange={set('contato_whatsapp')} placeholder="(11) 99999-9999"
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
