import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CooperLiga — Gestão Logística',
  description: 'Sistema de gestão de rotas e guias de remessa da CooperLiga',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CooperLiga' },
}

export const viewport: Viewport = {
  themeColor: '#072740',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
