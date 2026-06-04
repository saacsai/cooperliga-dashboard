'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { buscarCEP } from '@/lib/useCEPLookup'
import Drawer from '@/components/Drawer'
import type { Usuario, Perfil } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const PERFIS: Perfil[] = ['admin', 'gestor', 'analista', 'financeiro', 'operador']

const BADGE: Record<Perfil, string> = {
  admin:      'bg-red-100 text-red-800',
  gestor:     'bg-orange-100 text-orange-800',
  analista:   'bg-blue-100 text-blue-800',
  financeiro: 'bg-green-100 text-green-800',
  operador:   'bg-gray-100 text-gray-700',
}

const PERFIL_LABEL: Record<Perfil, string> = {
  admin:      'Admin',
  gestor:     'Gestor',
  analista:   'Analista',
  financeiro: 'Financeiro',
  operador:   'Operador',
}

type Modo = 'criar' | 'editar'

interface FormState {
  nome: string
  email: string
  whatsapp: string
  perfil: Perfil
  cargo: string
  cpf: string
  rg: string
  data_nascimento: string
  endereco: string
  municipio: string
  cep: string
}

const FORM_VAZIO: FormState = {
  nome: '', email: '', whatsapp: '', perfil: 'operador',
  cargo: '', cpf: '', rg: '', data_nascimento: '', endereco: '', municipio: '', cep: '',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios]   = useState<Usuario[]>([])
  const [loading,  setLoading]    = useState(true)
  const [drawer,   setDrawer]     = useState(false)
  const [modo,     setModo]       = useState<Modo>('criar')
  const [editId,   setEditId]     = useState<string | null>(null)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [form,        setForm]        = useState<FormState>(FORM_VAZIO)
  const [buscandoCEP, setBuscandoCEP] = useState(false)
  const [busca,       setBusca]       = useState('')
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const usuariosFiltrados = useMemo(() => {
    if (!busca.trim()) return usuarios
    const q = busca.toLowerCase()
    return usuarios.filter(u =>
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.whatsapp || '').includes(q)
    )
  }, [usuarios, busca])

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  async function carregar() {
    const { data } = await getSupabase().from('usuarios').select('*').order('nome')
    setUsuarios(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirCriar() {
    setModo('criar')
    setEditId(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDrawer(true)
  }

  function abrirEditar(u: Usuario) {
    setModo('editar')
    setEditId(u.id)
    setForm({
      nome:            u.nome,
      email:           u.email,
      whatsapp:        u.whatsapp        || '',
      perfil:          u.perfil,
      cargo:           (u as any).cargo  || '',
      cpf:             u.cpf             || '',
      rg:              u.rg              || '',
      data_nascimento: u.data_nascimento || '',
      endereco:        u.endereco        || '',
      municipio:       u.municipio       || '',
      cep:             u.cep             || '',
    })
    setErro('')
    setDrawer(true)
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
    setSalvando(true)
    setErro('')

    if (modo === 'criar') {
      const { data: { session } } = await getSupabase().auth.getSession()
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          nome: form.nome, email: form.email, whatsapp: form.whatsapp,
          perfil: form.perfil,
          cargo: form.cargo || null,
          cpf: form.cpf || null, rg: form.rg || null,
          data_nascimento: form.data_nascimento || null,
          endereco: form.endereco || null, municipio: form.municipio || null,
          cep: form.cep || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Erro ao criar usuário'); setSalvando(false); return }
    } else {
      const res = await fetch(`/api/admin/usuarios/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome, whatsapp: form.whatsapp, perfil: form.perfil,
          cargo: form.cargo || null,
          cpf: form.cpf || null, rg: form.rg || null,
          data_nascimento: form.data_nascimento || null,
          endereco: form.endereco || null, municipio: form.municipio || null,
          cep: form.cep || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Erro ao atualizar usuário'); setSalvando(false); return }
    }

    setDrawer(false)
    setSalvando(false)
    carregar()
  }

  async function toggleAtivo(u: Usuario) {
    await getSupabase().from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id)
    carregar()
  }

  async function handleExcluir(u: Usuario) {
    const { data: { session } } = await getSupabase().auth.getSession()
    const res = await fetch(`/api/admin/usuarios/${u.id}`, {
      method: 'DELETE',
      headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error || 'Erro ao excluir'); return }
    setExcluindoId(null)
    carregar()
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie quem tem acesso ao sistema</p>
        </div>
        <button
          onClick={abrirCriar}
          className="text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: PRIMARY }}
        >
          + Novo usuário
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, email ou WhatsApp…"
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
        </div>
        {busca && <button onClick={() => setBusca('')} className="text-xs text-gray-400 hover:text-gray-700">Limpar</button>}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {busca ? `${usuariosFiltrados.length} de ${usuarios.length}` : `${usuarios.length} usuários`}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">WhatsApp</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Perfil</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map(u => (
                <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-gray-400">{u.whatsapp || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[u.perfil]}`}>
                      {PERFIL_LABEL[u.perfil]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {excluindoId === u.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Confirmar exclusão?</span>
                        <button onClick={() => handleExcluir(u)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800">Excluir</button>
                        <button onClick={() => setExcluindoId(null)}
                          className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => abrirEditar(u)}
                          className="text-xs font-medium transition-colors hover:opacity-80"
                          style={{ color: PRIMARY }}>
                          Editar
                        </button>
                        <button onClick={() => toggleAtivo(u)}
                          className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => setExcluindoId(u.id)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors">
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    {busca ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={modo === 'criar' ? 'Novo usuário' : 'Editar usuário'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            {modo === 'criar' ? (
              <input type="email" value={form.email} onChange={set('email')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            ) : (
              <input type="email" value={form.email} disabled
                className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
            <input type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-9999"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cargo / Função</label>
            <input type="text" value={form.cargo} onChange={set('cargo')} placeholder="ex: Coordenador de Logística"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Perfil</label>
            <select value={form.perfil} onChange={set('perfil')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              {PERFIS.map(p => (
                <option key={p} value={p}>{PERFIL_LABEL[p]}</option>
              ))}
            </select>
          </div>

          {modo === 'criar' && (
            <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Um email será enviado ao usuário com um link para ele definir a própria senha.
            </p>
          )}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ficha RH</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CPF</label>
                  <input type="text" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">RG</label>
                  <input type="text" value={form.rg} onChange={set('rg')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data de nascimento</label>
                <input type="date" value={form.data_nascimento} onChange={set('data_nascimento')}
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
            </div>
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
              {salvando ? 'Salvando…' : modo === 'criar' ? 'Criar usuário' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
