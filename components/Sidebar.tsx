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

function Icon({ d, d2, d3, circle }: { d: string; d2?: string; d3?: string; circle?: { cx: number; cy: number; r: number } }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
      {d3 && <path d={d3} />}
      {circle && <circle cx={circle.cx} cy={circle.cy} r={circle.r} />}
    </svg>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  manifestos: <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" d2="M9 3h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" d3="M9 12h6M9 16h4" />,
  guias:      <Icon d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" d2="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />,
  clientes:   <Icon d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18H6z" d2="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" d3="M10 7h4M10 11h4M10 15h4" />,
  contratos:  <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" d2="M14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  pontos:     <Icon d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" circle={{ cx: 12, cy: 10, r: 3 }} />,
  produtos:   <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" d2="M7 7h.01" />,
  rotas:      <Icon d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11v14H5zM9 17h6M13 3h5l3 3v6h-8V3z" d2="M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  agregados:  <Icon d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" circle={{ cx: 12, cy: 7, r: 4 }} />,
  estoque:    <Icon d="M5 8h14M5 8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />,
  financeiro: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>,
  usuarios:   <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" circle={{ cx: 9, cy: 7, r: 4 }} />,
  bia:        <Icon d="M12 8V4H8M12 8c-3.87 0-6 2-6 4v4h12v-4c0-2-2.13-4-6-4zM2 14h3M19 14h3M6 18v2M18 18v2" d2="M9 14h.01M15 14h.01" />,
}

interface NavItem {
  href: string
  label: string
  iconKey: string
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
      { href: '/dashboard/manifestos', label: 'Manifestos',  iconKey: 'manifestos', perfis: ['admin','gestor','analista','operador'] },
      { href: '/dashboard/guias',      label: 'Guias (GRs)', iconKey: 'guias',      perfis: ['admin','gestor','analista','operador'] },
      { href: '/dashboard/estoque',    label: 'Estoque',     iconKey: 'estoque',    perfis: ['admin','gestor','analista','operador','financeiro'] },
    ],
  },
  {
    label: 'CADASTROS',
    items: [
      { href: '/dashboard/clientes',          label: 'Clientes',          iconKey: 'clientes',  perfis: ['admin','gestor'] },
      { href: '/dashboard/contratos',         label: 'Contratos',         iconKey: 'contratos', perfis: ['admin','gestor'] },
      { href: '/dashboard/pontos-de-entrega', label: 'Pontos de Entrega', iconKey: 'pontos',    perfis: ['admin','gestor'] },
      { href: '/dashboard/produtos',          label: 'Produtos',          iconKey: 'produtos',  perfis: ['admin','gestor'] },
      { href: '/dashboard/rotas',             label: 'Rotas',             iconKey: 'rotas',     perfis: ['admin','gestor'] },
      { href: '/dashboard/agregados',         label: 'Agregados',         iconKey: 'agregados', perfis: ['admin','gestor'] },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { href: '/dashboard/financeiro', label: 'Financeiro', iconKey: 'financeiro', perfis: ['admin','financeiro'] },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/dashboard/admin/usuarios', label: 'Usuários', iconKey: 'usuarios', perfis: ['admin'] },
    ],
  },
]

interface Props {
  nome: string
  email: string
  perfil: Perfil
  onEditarPerfil: () => void
  mobileAberto?: boolean
  onMobileFechar?: () => void
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function Sidebar({ nome, email, perfil, onEditarPerfil, mobileAberto = false, onMobileFechar }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await getSupabase().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Backdrop mobile */}
      {mobileAberto && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onMobileFechar}
        />
      )}
      <aside
        style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, background: PRIMARY }}
        className={`fixed left-0 top-0 h-screen flex flex-col z-30 transition-transform duration-200 ease-in-out
          ${mobileAberto ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
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
                        color: ativo ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                        fontWeight: ativo ? 600 : 400,
                      }}
                    >
                      <span className="flex-shrink-0">{ICONS[item.iconKey]}</span>
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
          <span className="flex-shrink-0">{ICONS.bia}</span>
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
    </>
  )
}
