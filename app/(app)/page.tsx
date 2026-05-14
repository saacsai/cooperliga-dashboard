import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'

export default async function HomePage() {
  const sb = await createServerSupabase()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await sb
    .from('usuarios')
    .select('perfil')
    .eq('id', user.id)
    .single()

  const perfil = usuario?.perfil || 'operador'

  if (perfil === 'financeiro') redirect('/financeiro/dashboard')
  redirect('/manifestos')
}
