import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import Sidebar from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerSupabase()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await sb
    .from('usuarios')
    .select('nome, perfil')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar
        nome={usuario?.nome || user.email || ''}
        perfil={usuario?.perfil || 'operador'}
      />
      <main className="ml-56 flex-1 p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}
