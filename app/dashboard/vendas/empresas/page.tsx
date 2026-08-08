'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { buscarCNPJ } from '@/lib/useCNPJLookup'
import Drawer from '@/components/Drawer'
import type { CeafEmpresa, CeafFuncionario } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const VAZIO_EMPRESA = {
  nome: '', cnpj: '', razao_social: '', endereco_entrega: '',
  municipio: '', cep: '', contato_nome: '', contato_whatsapp: '', email: '',
}

const VAZIO_FUNC = { nome: '', whatsapp: '' }

function fmtCNPJ(s: string) {
  const d = s.replace(/\D/g, '')
  if (d.length !== 14) return s
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export default function EmpresasPage() {
  const [empresas,      setEmpresas]      = useState<CeafEmpresa[]>([])
  const [funcionarios,  setFuncionarios]  = useState<CeafFuncionario[]>([])
  const [loading,       setLoading]       = useState(true)
  const [drawerEmpresa, setDrawerEmpresa] = useState(false)
  const [drawerFunc,    setDrawerFunc]    = useState(false)
  const [editId,        setEditId]        = useState<string | null>(null)
  const [empresaSel,    setEmpresaSel]    = useState<CeafEmpresa | null>(null)
  const [salvando,      setSalvando]      = useState(false)
  const [erro,          setErro]          = useState('')
  const [form,          setForm]          = useState(VAZIO_EMPRESA)
  const [formFunc,      setFormFunc]      = useState(VAZIO_FUNC)
  const [editFuncId,    setEditFuncId]    = useState<string | null>(null)
  const [buscandoCNPJ,  setBuscandoCNPJ]  = useState(false)
  const [busca,         setBusca]         = useState('')

  const empresasFiltradas = useMemo(() => {
    if (!busca.trim()) return empresas
    const q = busca.toLowerCase()
    return empresas.filter(e =>
      e.nome.toLowerCase().includes(q) ||
      (e.municipio || '').toLowerCase().includes(q) ||
      (e.cnpj || '').includes(q)
    )
  }, [empresas, busca])

  const funcsEmpresa = useMemo(() =>
    empresaSel ? funcionarios.filter(f => f.empresa_id === empresaSel.id) : []
  , [funcionarios, empresaSel])

  const set = (f: keyof typeof VAZIO_EMPRESA) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  const setF = (f: keyof typeof VAZIO_FUNC) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormFunc(p => ({ ...p, [f]: e.target.value }))

  async function carregar() {
    const sb = getSupabase()
    const [{ data: emp }, { data: func }] = await Promise.all([
      sb.from('ceaf_empresas').select('*').order('nome'),
      sb.from('ceaf_funcionarios').select('*').order('nome'),
    ])
    setEmpresas(emp || [])
    setFuncionarios(func || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function handleCNPJBlur() {
    const digits = form.cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCNPJ(true)
    const dados = await buscarCNPJ(form.cnpj)
    if (dados) {
      setForm(p => ({
        ...p,
        razao_social: dados.razao_social || p.razao_social,
        nome: p.nome || dados.nome_fantasia || dados.razao_social,
        municipio: p.municipio || dados.municipio || '',
        email: p.email || dados.email || '',
      }))
    }
    setBuscandoCNPJ(false)
  }

  function abrirNova() {
    setEditId(null); setForm(VAZIO_EMPRESA); setErro(''); setDrawerEmpresa(true)
  }

  function abrirEditar(e: CeafEmpresa) {
    setEditId(e.id)
    setForm({
      nome: e.nome, cnpj: e.cnpj || '', razao_social: e.razao_social || '',
      endereco_entrega: e.endereco_entrega || '', municipio: e.municipio || '',
      cep: e.cep || '', contato_nome: e.contato_nome || '',
      contato_whatsapp: e.contato_whatsapp || '', email: e.email || '',
    })
    setErro(''); setDrawerEmpresa(true)
  }

  async function handleSalvarEmpresa(ev: React.FormEvent) {
    ev.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj || null,
      razao_social: form.razao_social || null,
      endereco_entrega: form.endereco_entrega || null,
      municipio: form.municipio || null,
      cep: form.cep || null,
      contato_nome: form.contato_nome || null,
      contato_whatsapp: form.contato_whatsapp || null,
      email: form.email || null,
    }
    const sb = getSupabase()
    const { error } = editId
      ? await sb.from('ceaf_empresas').update(payload).eq('id', editId)
      : await sb.from('ceaf_empresas').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    await carregar()
    setSalvando(false); setDrawerEmpresa(false)
  }

  async function toggleAtiva(e: CeafEmpresa) {
    await getSupabase().from('ceaf_empresas').update({ ativa: !e.ativa }).eq('id', e.id)
    carregar()
  }

  function abrirFuncionarios(e: CeafEmpresa) {
    setEmpresaSel(e); setEditFuncId(null); setFormFunc(VAZIO_FUNC); setErro(''); setDrawerFunc(true)
  }

  function abrirEditarFunc(f: CeafFuncionario) {
    setEditFuncId(f.id); setFormFunc({ nome: f.nome, whatsapp: f.whatsapp }); setErro('')
  }

  async function handleSalvarFunc(ev: React.FormEvent) {
    ev.preventDefault()
    if (!empresaSel) return
    setSalvando(true); setErro('')
    const payload = { nome: formFunc.nome.trim(), whatsapp: formFunc.whatsapp.trim(), empresa_id: empresaSel.id }
    const sb = getSupabase()
    const { error } = editFuncId
      ? await sb.from('ceaf_funcionarios').update({ nome: payload.nome, whatsapp: payload.whatsapp }).eq('id', editFuncId)
      : await sb.from('ceaf_funcionarios').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    await carregar()
    setSalvando(false); setEditFuncId(null); setFormFunc(VAZIO_FUNC)
  }

  async function toggleAtivoFunc(f: CeafFuncionario) {
    await getSupabase().from('ceaf_funcionarios').update({ ativo: !f.ativo }).eq('id', f.id)
    carregar()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Empresas CEAF</h1>
          <p className="text-xs text-gray-400 mt-0.5">Clientes corporativos do programa Cesta de AF</p>
        </div>
        <button onClick={abrirNova}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: PRIMARY }}>
          + Nova empresa
        </button>
      </div>

      <input
        value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar por nome, município ou CNPJ…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-[#5C0F0F] bg-white"
      />

      {empresasFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhuma empresa cadastrada ainda.</p>
          <button onClick={abrirNova} className="mt-3 text-sm font-medium" style={{ color: PRIMARY }}>
            Cadastrar primeira empresa →
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">CNPJ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Município</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Contato</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Func.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {empresasFiltradas.map((e, i) => {
                const nFunc = funcionarios.filter(f => f.empresa_id === e.id && f.ativo).length
                return (
                  <tr key={e.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${!e.ativa ? 'opacity-50' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{e.nome}</p>
                      {e.razao_social && e.razao_social !== e.nome && (
                        <p className="text-xs text-gray-400">{e.razao_social}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">
                      {e.cnpj ? fmtCNPJ(e.cnpj) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{e.municipio || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {e.contato_nome && <p className="text-gray-700 text-xs">{e.contato_nome}</p>}
                      {e.contato_whatsapp && <p className="text-gray-400 text-xs font-mono">{e.contato_whatsapp}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => abrirFuncionarios(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md"
                        style={{ background: '#F5EFEF', color: PRIMARY }}>
                        {nFunc} {nFunc === 1 ? 'func' : 'funcs'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => abrirEditar(e)}
                          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
                          Editar
                        </button>
                        <button onClick={() => toggleAtiva(e)}
                          className="text-xs px-2 py-1 rounded hover:bg-gray-100"
                          style={{ color: e.ativa ? '#dc2626' : '#16a34a' }}>
                          {e.ativa ? 'Inativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer empresa */}
      <Drawer open={drawerEmpresa} onClose={() => setDrawerEmpresa(false)} title={editId ? 'Editar empresa' : 'Nova empresa CEAF'}>
        <form onSubmit={handleSalvarEmpresa} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
            <input type="text" value={form.cnpj} onChange={set('cnpj')} onBlur={handleCNPJBlur}
              placeholder="00.000.000/0000-00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            {buscandoCNPJ && <p className="text-xs text-gray-400 mt-0.5">Buscando CNPJ…</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome fantasia *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razão social</label>
            <input type="text" value={form.razao_social} onChange={set('razao_social')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Endereço de entrega</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Endereço completo</label>
                <input type="text" value={form.endereco_entrega} onChange={set('endereco_entrega')}
                  placeholder="Rua, número, bairro"
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
                  <input type="text" value={form.cep} onChange={set('cep')} placeholder="00000-000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contato</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do contato</label>
                <input type="text" value={form.contato_nome} onChange={set('contato_nome')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                <input type="tel" value={form.contato_whatsapp} onChange={set('contato_whatsapp')}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                <input type="email" value={form.email} onChange={set('email')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
            </div>
          </div>

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawerEmpresa(false)}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Drawer funcionários */}
      <Drawer open={drawerFunc} onClose={() => setDrawerFunc(false)} title={`Funcionários — ${empresaSel?.nome || ''}`}>
        <div className="space-y-4">
          {/* Form inline novo/editar funcionário */}
          <form onSubmit={handleSalvarFunc} className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {editFuncId ? 'Editar funcionário' : 'Adicionar funcionário'}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
              <input type="text" value={formFunc.nome} onChange={setF('nome')} required
                placeholder="Nome completo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp *</label>
              <input type="tel" value={formFunc.whatsapp} onChange={setF('whatsapp')} required
                placeholder="(11) 99999-9999"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white" />
            </div>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex gap-2">
              {editFuncId && (
                <button type="button" onClick={() => { setEditFuncId(null); setFormFunc(VAZIO_FUNC) }}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-100">
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={salvando}
                className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: PRIMARY }}>
                {salvando ? 'Salvando…' : editFuncId ? 'Atualizar' : '+ Adicionar'}
              </button>
            </div>
          </form>

          {/* Lista de funcionários */}
          {funcsEmpresa.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Nenhum funcionário cadastrado.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {funcsEmpresa.map(f => (
                <div key={f.id} className={`py-3 flex items-center gap-3 ${!f.ativo ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{f.nome}</p>
                    <p className="text-xs text-gray-400 font-mono">{f.whatsapp}</p>
                    {f.preferencias_nunca && f.preferencias_nunca.length > 0 && (
                      <p className="text-xs text-orange-500 mt-0.5">
                        {f.preferencias_nunca.length} restrição(ões)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => abrirEditarFunc(f)}
                      className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                      Editar
                    </button>
                    <button onClick={() => toggleAtivoFunc(f)}
                      className="text-xs px-2 py-1 rounded hover:bg-gray-100"
                      style={{ color: f.ativo ? '#dc2626' : '#16a34a' }}>
                      {f.ativo ? 'Inativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  )
}
