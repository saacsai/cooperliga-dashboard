'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
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
  senha: string
}

const FORM_VAZIO: FormState = { nome: '', email: '', whatsapp: '', perfil: 'operador', senha: '' }

export default function UsuariosPage() {
  const [usuarios, setUsuarios]   = useState<Usuario[]>([])
  const [loading,  setLoading]    = useState(true)
  const [modal,    setModal]      = useState(false)
  const [modo,     setModo]       = useState<Modo>('criar')
  const [editId,   setEditId]     = useState<string | null>(null)
  const [salvando, setSalvando]   = useState(false)
  const [erro,     setErro]       = useState('')
  const [form,     setForm]       = useState<FormState>(FORM_VAZIO)

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
    setModal(true)
  }

  function abrirEditar(u: Usuario) {
    setModo('editar')
    setEditId(u.id)
    setForm({ nome: u.nome, email: u.email, whatsapp: u.whatsapp || '', perfil: u.perfil, senha: '' })
    setErro('')
    setModal(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    if (modo === 'criar') {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: form.nome, email: form.email, whatsapp: form.whatsapp, perfil: form.perfil, senha: form.senha }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Erro ao criar usuário'); setSalvando(false); return }
    } else {
      const res = await fetch(`/api/admin/usuarios/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: form.nome, whatsapp: form.whatsapp, perfil: form.perfil }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Erro ao atualizar usuário'); setSalvando(false); return }
    }

    setModal(false)
    setSalvando(false)
    carregar()
  }

  async function toggleAtivo(u: Usuario) {
    await getSupabase().from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id)
    carregar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie quem tem acesso ao sistema</p>
        </div>
        <button
          onClick={abrirCriar}
          className="text-white text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: PRIMARY }}
        >
          + Novo usuário
        </button>
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
              {usuarios.map(u => (
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
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="text-xs font-medium transition-colors hover:opacity-80"
                        style={{ color: PRIMARY }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleAtivo(u)}
                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        {u.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhum usuário cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar / editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {modo === 'criar' ? 'Novo usuário' : 'Editar usuário'}
            </h2>

            <form onSubmit={handleSalvar} className="space-y-3">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Perfil</label>
                <select value={form.perfil} onChange={set('perfil')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
                  {PERFIS.map(p => (
                    <option key={p} value={p}>{PERFIL_LABEL[p]}</option>
                  ))}
                </select>
              </div>

              {modo === 'criar' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Senha inicial</label>
                  <input type="password" value={form.senha} onChange={set('senha')} required minLength={6}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
              )}

              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  style={{ background: PRIMARY }}>
                  {salvando ? 'Salvando…' : modo === 'criar' ? 'Criar usuário' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
