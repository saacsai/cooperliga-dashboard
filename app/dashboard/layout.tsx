'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import type { Perfil } from '@/lib/supabase'

const SIDEBAR_W = '224px'
const PRIMARY   = '#5C0F0F'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading,       setLoading]      = useState(true)
  const [userId,        setUserId]       = useState('')
  const [nome,          setNome]         = useState('')
  const [email,         setEmail]        = useState('')
  const [perfil,        setPerfil]       = useState<Perfil>('operador')
  const [modalPerfil,   setModalPerfil]  = useState(false)

  // form editar perfil
  const [editNome, setEditNome] = useState('')
  const [editWpp,  setEditWpp]  = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroEdit, setErroEdit] = useState('')
  const [okEdit,   setOkEdit]   = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }

      setEmail(session.user.email || '')
      setUserId(session.user.id)

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome, perfil, whatsapp')
        .eq('id', session.user.id)
        .single()

      if (!usuario) {
        await supabase.auth.signOut()
        window.location.href = '/login?erro=sem-acesso'
        return
      }

      setNome(usuario.nome)
      setPerfil(usuario.perfil as Perfil)
      setEditNome(usuario.nome)
      setEditWpp(usuario.whatsapp || '')
      setLoading(false)
    })
  }, [])

  function abrirModalPerfil() {
    setErroEdit('')
    setOkEdit(false)
    setModalPerfil(true)
  }

  async function handleSalvarPerfil(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErroEdit('')
    const res = await fetch(`/api/admin/usuarios/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: editNome, whatsapp: editWpp, perfil }),
    })
    const json = await res.json()
    if (!res.ok) { setErroEdit(json.error || 'Erro ao salvar'); setSalvando(false); return }
    setNome(editNome)
    setOkEdit(true)
    setSalvando(false)
    setTimeout(() => setModalPerfil(false), 1200)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5EFEF' }}>
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5EFEF' }}>
      <Sidebar
        nome={nome}
        email={email}
        perfil={perfil}
        onEditarPerfil={abrirModalPerfil}
      />
      <main style={{ marginLeft: SIDEBAR_W, minHeight: '100vh' }} className="p-8">
        {children}
      </main>

      {/* Modal editar perfil */}
      {modalPerfil && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Editar perfil</h2>
            <p className="text-xs text-gray-400 mb-4">{email}</p>

            {okEdit ? (
              <div className="py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-700 font-medium">Salvo com sucesso</p>
              </div>
            ) : (
              <form onSubmit={handleSalvarPerfil} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
                  <input
                    type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                    required autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                  <input
                    type="tel" value={editWpp} onChange={e => setEditWpp(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
                  <a
                    href={`/reset-password`}
                    onClick={() => setModalPerfil(false)}
                    className="text-xs hover:underline"
                    style={{ color: PRIMARY }}
                  >
                    Alterar senha →
                  </a>
                </div>
                {erroEdit && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erroEdit}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setModalPerfil(false)}
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
