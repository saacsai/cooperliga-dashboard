'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function CallbackPage() {
  useEffect(() => {
    const hash   = window.location.hash
    const params = new URLSearchParams(window.location.search)

    if (hash.includes('type=recovery')) {
      window.location.href = '/reset-password' + hash
      return
    }

    async function resolve() {
      const supabase = getSupabase()
      let session = (await supabase.auth.getSession()).data.session

      if (!session) {
        const code = params.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) { window.location.href = '/login?erro=link-invalido'; return }
          session = (await supabase.auth.getSession()).data.session
        }
      }

      if (!session) { window.location.href = '/login?erro=link-invalido'; return }
      window.location.href = '/dashboard'
    }

    resolve()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5EFEF' }}>
      <p className="text-sm text-gray-400">Verificando acesso…</p>
    </div>
  )
}
