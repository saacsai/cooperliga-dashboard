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

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')

  const [nome,   setNome]   = useState('')
  const [email,  setEmail]  = useState('')
  const [wpp,    setWpp]    = useState('')
  const [perfil, setPerfil] = useState<Perfil>('operador')
  const [senha,  setSenha]  = useState('')

  async function carregar() {
    const { data } = await getSupabase().from('usuarios').select('*').order('nome')
    setUsuarios(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirModal() {
    setNome(''); setEmail(''); setWpp(''); setPerfil('operador'); setSenha(''); setErro('')
    setModal(true)
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, whatsapp: wpp, perfil, senha }),
    })
    const json = await res.json()
    if (!res.ok) { setErro(json.error || 'Erro ao criar usuário'); setSalvando(false); return }
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
          onClick={abrirModal}
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
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[u.perfil]}`}>
                      {u.perfil}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleAtivo(u)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhum usuário cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar usuário */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Novo usuário</h2>
            <form onSubmit={handleCriar} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp (opcional)</label>
                <input type="tel" value={wpp} onChange={e => setWpp(e.target.value)} placeholder="(11) 99999-9999"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Perfil</label>
                <select value={perfil} onChange={e => setPerfil(e.target.value as Perfil)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
                  {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Senha inicial</label>
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
              </div>
              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  style={{ background: PRIMARY }}>
                  {salvando ? 'Criando…' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
