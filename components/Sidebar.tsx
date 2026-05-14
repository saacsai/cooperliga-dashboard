'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import type { Perfil } from '@/lib/supabase'

interface NavItem {
  href: string
  label: string
  perfis: Perfil[]
}

const NAV: NavItem[] = [
  { href: '/manifestos',         label: 'Manifestos',     perfis: ['admin','gestor','analista','operador'] },
  { href: '/manifestos/processar', label: '↳ Processar ZIP', perfis: ['admin','gestor'] },
  { href: '/romaneios/patio',    label: 'Pátio',          perfis: ['admin','gestor','analista','operador'] },
  { href: '/cadastros/rotas',    label: 'Rotas',          perfis: ['admin','gestor'] },
  { href: '/cadastros/escolas',  label: 'Escolas',        perfis: ['admin','gestor'] },
  { href: '/financeiro/dashboard', label: 'Financeiro',   perfis: ['admin','financeiro'] },
  { href: '/admin/usuarios',     label: 'Usuários',       perfis: ['admin'] },
]

interface Props {
  nome: string
  perfil: string
}

export default function Sidebar({ nome, perfil }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const sb = createBrowserSupabase()
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visivel = NAV.filter(n => n.perfis.includes(perfil as Perfil))

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">CooperLiga</p>
        <p className="text-xs text-gray-400 mt-0.5">Gestão logística</p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visivel.map(item => {
          const ativo = pathname === item.href || (item.href !== '/manifestos' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                ativo
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 truncate">{nome}</p>
        <p className="text-xs text-gray-400 capitalize">{perfil}</p>
        <button
          onClick={handleLogout}
          className="mt-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
