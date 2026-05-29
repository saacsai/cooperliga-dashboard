'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import AvatarMenu from './AvatarMenu'
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

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'OPERACIONAL',
    items: [
      { href: '/dashboard/manifestos', label: 'Manifestos',  icon: '📋', perfis: ['admin','gestor','analista','operador'] },
      { href: '/dashboard/guias',      label: 'Guias (GRs)', icon: '📦', perfis: ['admin','gestor','analista','operador'] },
    ],
  },
  {
    label: 'CADASTROS',
    items: [
      { href: '/dashboard/clientes',          label: 'Clientes',          icon: '🏢', perfis: ['admin','gestor'] },
      { href: '/dashboard/contratos',         label: 'Contratos',         icon: '📄', perfis: ['admin','gestor'] },
      { href: '/dashboard/pontos-de-entrega', label: 'Pontos de Entrega', icon: '📍', perfis: ['admin','gestor'] },
      { href: '/dashboard/produtos',          label: 'Produtos',          icon: '🥦', perfis: ['admin','gestor'] },
      { href: '/dashboard/rotas',             label: 'Rotas',             icon: '🚛', perfis: ['admin','gestor'] },
      { href: '/dashboard/agregados',         label: 'Agregados',         icon: '👤', perfis: ['admin','gestor'] },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { href: '/dashboard/financeiro', label: 'Financeiro', icon: '💰', perfis: ['admin','financeiro'] },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/dashboard/admin/usuarios', label: 'Usuários', icon: '👥', perfis: ['admin'] },
    ],
  },
]

interface Props {
  nome: string
  email: string
  perfil: Perfil
  onEditarPerfil: () => void
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function Sidebar({ nome, email, perfil, onEditarPerfil }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await getSupabase().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, background: PRIMARY }}
      className="fixed left-0 top-0 h-screen flex flex-col z-10"
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <div className="rounded-lg overflow-hidden flex items-center justify-center" style={{ background: PRIMARY, height: 54 }}>
          <Image src="/cooperliga_logo.jpg" alt="CooperLiga" width={180} height={54} className="object-contain" priority />
        </div>
        <p className="text-center mt-2 text-xs" style={{ color: ACCENT }}>Gestão Logística</p>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />

      {/* Nav com seções */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => {
          const itens = section.items.filter(n => n.perfis.includes(perfil))
          if (itens.length === 0) return null
          return (
            <div key={section.label} className={si > 0 ? 'mt-3' : ''}>
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest" style={{ color: 'rgba(212,160,160,0.45)' }}>
                {section.label}
              </p>
              <div className="space-y-0.5">
                {itens.map(item => {
                  const ativo = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: ativo ? 'rgba(255,255,255,0.15)' : 'transparent',
                        color: ativo ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                        fontWeight: ativo ? 600 : 400,
                      }}
                    >
                      <span className="text-sm leading-none">{item.icon}</span>
                      <span className="text-[13px]">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />

      {/* BIA */}
      <div className="px-3 py-2">
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ background: 'rgba(212,160,160,0.2)', color: ACCENT }}
          disabled title="Em breve"
        >
          <span className="text-sm leading-none">🤖</span>
          <span className="flex-1 text-left text-[13px]">BIA</span>
          <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'rgba(212,160,160,0.3)', color: ACCENT }}>
            em breve
          </span>
        </button>
      </div>

      {/* Usuário */}
      <div className="px-2 pb-2">
        <AvatarMenu
          nomeExibido={nome || email}
          email={email}
          initials={iniciais(nome || email)}
          dark
          onEditarPerfil={onEditarPerfil}
          onGerenciarPlano={() => {}}
          onUsoCredits={() => {}}
          onSair={handleLogout}
        />
      </div>

      <div className="flex justify-center pb-3">
        <Image src="/logo_saacs_sem_slogan.png" alt="SAACS" width={83} height={22} className="object-contain opacity-50" />
      </div>
    </aside>
  )
}
