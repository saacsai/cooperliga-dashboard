'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import type { Perfil } from '@/lib/supabase'

const SIDEBAR_W = '224px'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [nome,    setNome]    = useState('')
  const [email,   setEmail]   = useState('')
  const [perfil,  setPerfil]  = useState<Perfil>('operador')

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }

      setEmail(session.user.email || '')

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome, perfil')
        .eq('id', session.user.id)
        .single()

      if (!usuario) {
        // Usuário autenticado mas sem registro — pode ter sido criado direto pelo Supabase
        // Redireciona para o admin resolver
        await supabase.auth.signOut()
        window.location.href = '/login?erro=sem-acesso'
        return
      }

      setNome(usuario.nome)
      setPerfil(usuario.perfil as Perfil)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5EFEF' }}>
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5EFEF' }}>
      <Sidebar nome={nome} email={email} perfil={perfil} />
      <main style={{ marginLeft: SIDEBAR_W, minHeight: '100vh' }} className="p-8">
        {children}
      </main>
    </div>
  )
}
