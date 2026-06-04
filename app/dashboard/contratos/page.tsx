'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import type { Cliente, Contrato } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const ORGAOS = ['Estado SP', 'Prefeitura SP', 'Prefeitura Mauá']

const VAZIO = { cliente_id: '', orgao: '', numero: '', codigo: '', tipo_gr: '' as '' | 'estado' | 'municipal', descricao: '' }

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [clientes,  setClientes]  = useState<Pick<Cliente, 'id' | 'nome'>[]>([])
  const [loading,   setLoading]   = useState(true)
  const [drawer,    setDrawer]    = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [salvando,  setSalvando]  = useState(false)
  const [erro,      setErro]      = useState('')
  const [form,      setForm]      = useState(VAZIO)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const [{ data: c }, { data: cl }] = await Promise.all([
      getSupabase().from('contratos').select('*, clientes(nome)').order('orgao'),
      getSupabase().from('clientes').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setContratos((c || []) as unknown as Contrato[])
    setClientes((cl || []) as unknown as Pick<Cliente, 'id' | 'nome'>[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(c: Contrato) {
    setEditId(c.id)
    setForm({ cliente_id: c.cliente_id, orgao: c.orgao, numero: c.numero || '', codigo: c.codigo || '', tipo_gr: c.tipo_gr || '', descricao: c.descricao || '' })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      cliente_id: form.cliente_id,
      orgao: form.orgao,
      numero: form.numero || null,
      codigo: form.codigo || null,
      tipo_gr: form.tipo_gr || null,
      descricao: form.descricao || null,
    }
    const { error } = editId
      ? await getSupabase().from('contratos').update(payload).eq('id', editId)
      : await getSupabase().from('contratos').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleExcluir(c: Contrato) {
    if (!confirm(`Excluir o contrato "${c.orgao}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await getSupabase().from('contratos').delete().eq('id', c.id)
    if (error) {
      alert(error.message.includes('foreign key')
        ? `Não é possível excluir "${c.orgao}" pois existem ciclos ou rotas vinculados.`
        : `Erro ao excluir: ${error.message}`)
      return
    }
    setContratos(prev => prev.filter(x => x.id !== c.id))
  }

  async function toggleAtivo(c: Contrato) {
    await getSupabase().from('contratos').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  const TIPO_LABEL: Record<string, string> = { estado: 'Estado', municipal: 'Municipal' }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contratos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contratos de cada cooperativa com órgãos públicos</p>
        </div>
        <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
          + Novo contrato
        </button>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Órgão</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nº Contrato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo GR</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contratos.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{c.codigo || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.clientes?.nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{c.orgao}</td>
                  <td className="px-4 py-3 text-gray-500">{c.numero || '—'}</td>
                  <td className="px-4 py-3">
                    {c.tipo_gr && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.tipo_gr === 'estado' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {TIPO_LABEL[c.tipo_gr]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(c)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(c)} className="text-xs text-gray-400 hover:text-gray-700">{c.ativo ? 'Desativar' : 'Ativar'}</button>
                      <button onClick={() => handleExcluir(c)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {contratos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum contrato cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar contrato' : 'Novo contrato'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
            <select value={form.cliente_id} onChange={set('cliente_id')} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
              <option value="">Selecione…</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código do contrato</label>
            <input type="text" value={form.codigo} onChange={set('codigo')} placeholder="ex: MUN01, EST01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono uppercase" />
            <p className="text-xs text-gray-400 mt-1">Usado para gerar o código das rotas (ex: MUN01-08400-R1)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Órgão *</label>
            <input type="text" value={form.orgao} onChange={set('orgao')} required autoFocus
              list="orgaos-list" placeholder="Estado SP, Prefeitura SP…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            <datalist id="orgaos-list">
              {ORGAOS.map(o => <option key={o} value={o} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº do contrato</label>
            <input type="text" value={form.numero} onChange={set('numero')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de GR</label>
            <select value={form.tipo_gr} onChange={set('tipo_gr')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
              <option value="">Selecione…</option>
              <option value="estado">Estado</option>
              <option value="municipal">Municipal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <input type="text" value={form.descricao} onChange={set('descricao')} placeholder="Observações opcionais"
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
