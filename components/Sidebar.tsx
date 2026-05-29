'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import type { Perfil } from '@/lib/supabase'

const PRIMARY   = '#5C0F0F'
const ACCENT    = '#D4A0A0'
const SIDEBAR_W = '224px'

interface NavItem {
  href: string
  label: string
  icon: string
  perfis: Perfil[]
}

const NAV: NavItem[] = [
  { href: '/dashboard/manifestos', label: 'Manifestos',   icon: '📋', perfis: ['admin','gestor','analista','operador'] },
  { href: '/dashboard/guias',      label: 'Guias (GRs)',  icon: '📦', perfis: ['admin','gestor','analista','operador'] },
  { href: '/dashboard/cadastros',  label: 'Cadastros',    icon: '🗂️',  perfis: ['admin','gestor'] },
  { href: '/dashboard/financeiro', label: 'Financeiro',   icon: '💰', perfis: ['admin','financeiro'] },
  { href: '/dashboard/admin/usuarios', label: 'Usuários', icon: '👥', perfis: ['admin'] },
]

interface Props {
  nome: string
  email: string
  perfil: Perfil
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function Sidebar({ nome, email, perfil }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await getSupabase().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const itens = NAV.filter(n => n.perfis.includes(perfil))

  return (
    <aside
      style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, background: PRIMARY }}
      className="fixed left-0 top-0 h-screen flex flex-col z-10"
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <div className="rounded-lg overflow-hidden flex items-center justify-center" style={{ background: PRIMARY, height: 54 }}>
          <Image
            src="/cooperliga_logo.jpg"
            alt="CooperLiga"
            width={180}
            height={54}
            className="object-contain"
            priority
          />
        </div>
        <p className="text-center mt-2 text-xs" style={{ color: ACCENT }}>
          Gestão Logística
        </p>
      </div>

      <div style={{ borderTop: `1px solid rgba(255,255,255,0.1)` }} />

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {itens.map(item => {
          const ativo = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: ativo ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: ativo ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                fontWeight: ativo ? 600 : 400,
              }}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div style={{ borderTop: `1px solid rgba(255,255,255,0.1)` }} />

      {/* BIA — preview */}
      <div className="px-3 py-3">
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{ background: 'rgba(212,160,160,0.2)', color: ACCENT }}
          disabled
          title="Em breve"
        >
          <span className="text-base leading-none">🤖</span>
          <span className="flex-1 text-left">BIA</span>
          <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'rgba(212,160,160,0.3)', color: ACCENT }}>
            em breve
          </span>
        </button>
      </div>

      {/* Usuário */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: ACCENT, color: PRIMARY }}
          >
            {iniciais(nome || email)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{nome || email}</p>
            <p className="text-[10px] capitalize" style={{ color: ACCENT }}>{perfil}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className="text-xs transition-opacity hover:opacity-100 opacity-50"
            style={{ color: ACCENT }}
          >
            ↩
          </button>
        </div>

        <div className="flex justify-center mt-3">
          <Image src="/logo_saacs.png" alt="SAACS" width={72} height={22} className="object-contain opacity-30" />
        </div>
      </div>
    </aside>
  )
}
