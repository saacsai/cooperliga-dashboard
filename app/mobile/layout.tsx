import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'CooperLiga',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CooperLiga' },
}

export const viewport: Viewport = {
  themeColor: '#5C0F0F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>
}
