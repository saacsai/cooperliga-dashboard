'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { buscarCNPJ } from '@/lib/useCNPJLookup'
import { buscarCEP } from '@/lib/useCEPLookup'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import type { Cliente } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const VAZIO = {
  nome: '', tipo: 'cooperativa' as 'cooperativa' | 'associacao' | 'oscip' | 'empresa_privada' | 'orgao_publico' | 'outro',
  cnpj: '', codigo: '', razao_social: '', endereco: '', municipio: '', cep: '',
  telefone: '', email: '', contato_nome: '', contato_whatsapp: '',
}

const COLUNAS_IMPORT = [
  { key: 'nome',             label: 'Nome / Fantasia' },
  { key: 'tipo',             label: 'Tipo' },
  { key: 'cnpj',             label: 'CNPJ' },
  { key: 'razao_social',     label: 'Razão Social' },
  { key: 'codigo',           label: 'Código' },
  { key: 'municipio',        label: 'Município' },
  { key: 'cep',              label: 'CEP' },
  { key: 'endereco',         label: 'Endereço' },
  { key: 'telefone',         label: 'Telefone' },
  { key: 'email',            label: 'E-mail' },
  { key: 'contato_nome',     label: 'Contato Nome' },
  { key: 'contato_whatsapp', label: 'Contato WhatsApp' },
]

export default function ClientesPage() {
  const [clientes,     setClientes]     = useState<Cliente[]>([])
  const [loading,      setLoading]      = useState(true)
  const [drawer,       setDrawer]       = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [salvando,     setSalvando]     = useState(false)
  const [erro,         setErro]         = useState('')
  const [form,         setForm]         = useState(VAZIO)
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false)
  const [buscandoCEP,  setBuscandoCEP]  = useState(false)
  const [busca,        setBusca]        = useState('')

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes
    const q = busca.toLowerCase()
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.razao_social || '').toLowerCase().includes(q) ||
      (c.municipio || '').toLowerCase().includes(q) ||
      (c.cnpj || '').includes(q)
    )
  }, [clientes, busca])

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
    setForm({
      nome:             c.nome,
      tipo:             c.tipo || 'cooperativa' as any,
      cnpj:             c.cnpj             || '',
      codigo:           c.codigo           || '',
      razao_social:     c.razao_social     || '',
      endereco:         c.endereco         || '',
      municipio:        c.municipio        || '',
      cep:              c.cep              || '',
      telefone:         c.telefone         || '',
      email:            c.email            || '',
      contato_nome:     c.contato_nome     || '',
      contato_whatsapp: c.contato_whatsapp || '',
    })
    setErro(''); setDrawer(true)
  }

  async function handleCNPJBlur() {
    const digits = form.cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCNPJ(true)
    const dados = await buscarCNPJ(form.cnpj)
    if (dados) {
      setForm(p => ({
        ...p,
        razao_social: dados.razao_social || p.razao_social,
        nome:         p.nome || dados.nome_fantasia || dados.razao_social,
        endereco:     dados.endereco || p.endereco,
        municipio:    dados.municipio || p.municipio,
        cep:          dados.cep || p.cep,
        telefone:     dados.telefone || p.telefone,
        email:        dados.email || p.email,
      }))
    }
    setBuscandoCNPJ(false)
  }

  async function handleCEPBlur() {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCEP(true)
    const dados = await buscarCEP(form.cep)
    if (dados) {
      setForm(p => ({
        ...p,
        cep:      dados.cep,
        municipio: p.municipio || dados.municipio,
        endereco:  p.endereco  || [dados.logradouro, dados.bairro].filter(Boolean).join(', '),
      }))
    }
    setBuscandoCEP(false)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const db = getSupabase()
    const payload = {
      nome:             form.nome,
      tipo:             form.tipo,
      cnpj:             form.cnpj             || null,
      codigo:           form.codigo           || null,
      razao_social:     form.razao_social     || null,
      endereco:         form.endereco         || null,
      municipio:        form.municipio        || null,
      cep:              form.cep              || null,
      telefone:         form.telefone         || null,
      email:            form.email            || null,
      contato_nome:     form.contato_nome     || null,
      contato_whatsapp: form.contato_whatsapp || null,
    }
    const { error } = editId
      ? await db.from('clientes').update(payload).eq('id', editId)
      : await db.from('clientes').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const payload = rows.filter(r => r.nome).map(r => ({
      nome:             r.nome,
      tipo:             r.tipo || 'cooperativa' as any,
      cnpj:             r.cnpj             || null,
      razao_social:     r.razao_social     || null,
      codigo:           r.codigo           || null,
      municipio:        r.municipio        || null,
      cep:              r.cep              || null,
      endereco:         r.endereco         || null,
      telefone:         r.telefone         || null,
      email:            r.email            || null,
      contato_nome:     r.contato_nome     || null,
      contato_whatsapp: r.contato_whatsapp || null,
    }))
    const { error } = await getSupabase().from('clientes').upsert(payload, { onConflict: 'nome' })
    if (error) throw new Error(error.message)
    carregar()
  }

  async function toggleAtivo(c: Cliente) {
    await getSupabase().from('clientes').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  async function handleExcluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await getSupabase().from('clientes').delete().eq('id', c.id)
    if (error) {
      if (error.message.includes('foreign key')) {
        alert(`Não é possível excluir "${c.nome}" pois existem contratos vinculados. Exclua os contratos primeiro.`)
      } else {
        alert(`Erro ao excluir: ${error.message}`)
      }
      return
    }
    carregar()
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cooperativas e associações que contratam a CooperLiga</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Novo cliente
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou município…"
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
        </div>
        {busca && <button onClick={() => setBusca('')} className="text-xs text-gray-400 hover:text-gray-700">Limpar</button>}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {busca ? `${clientesFiltrados.length} de ${clientes.length}` : `${clientes.length} clientes`}
          </span>
        )}
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">CNPJ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Município</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{c.nome}</span>
                    {c.razao_social && c.razao_social !== c.nome && (
                      <span className="block text-xs text-gray-400">{c.razao_social}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.cnpj || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.municipio || '—'}</td>
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
                      <button onClick={() => handleExcluir(c)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {clientesFiltrados.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  {busca ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar cliente' : 'Novo cliente'}>
        <form onSubmit={handleSalvar} className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
              <input type="text" value={form.cnpj} onChange={set('cnpj')} onBlur={handleCNPJBlur}
                placeholder="00.000.000/0000-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              {buscandoCNPJ && <p className="text-xs text-gray-400 mt-0.5">Buscando CNPJ…</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={form.tipo} onChange={set('tipo')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                <option value="cooperativa">Cooperativa</option>
                <option value="associacao">Associação</option>
                <option value="oscip">OSCIP</option>
                <option value="empresa_privada">Empresa privada</option>
                <option value="orgao_publico">Órgão Público</option>
                <option value="outro">Outros</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social</label>
            <input type="text" value={form.razao_social} onChange={set('razao_social')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome / Fantasia *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
              <input type="text" value={form.municipio} onChange={set('municipio')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
              <input type="text" value={form.cep} onChange={set('cep')} onBlur={handleCEPBlur} placeholder="00000-000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              {buscandoCEP && <p className="text-xs text-gray-400 mt-0.5">Buscando CEP…</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
            <input type="text" value={form.endereco} onChange={set('endereco')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
              <input type="tel" value={form.telefone} onChange={set('telefone')} placeholder="(11) 3333-4444"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contato</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                <input type="text" value={form.contato_nome} onChange={set('contato_nome')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                <input type="tel" value={form.contato_whatsapp} onChange={set('contato_whatsapp')} placeholder="(11) 99999-9999"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código interno</label>
            <input type="text" value={form.codigo} onChange={set('codigo')} placeholder="ex: 01"
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
