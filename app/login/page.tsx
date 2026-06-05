'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const ACCENT  = '#D4A0A0'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const params = useSearchParams()
  const next = params.get('next') ?? (
    typeof window !== 'undefined' && /mobile|android|iphone|ipad/i.test(navigator.userAgent)
      ? '/mobile/estoque'
      : '/dashboard'
  )

  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [modo, setModo]         = useState<'login' | 'recuperar'>('login')
  const [loading, setLoading]   = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro]         = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    const { error } = await getSupabase().auth.signInWithPassword({ email, password: senha })
    if (error) {
      setErro('Email ou senha incorretos.')
      setLoading(false)
      return
    }
    window.location.href = next
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    const res = await fetch('/api/auth/recuperar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json()
    if (!res.ok) {
      setErro(`Erro ao enviar email: ${JSON.stringify(json.debug || json.error)}`)
      setLoading(false)
      return
    }
    setMensagem('Se este email estiver cadastrado, você receberá o link em instantes.')
    setLoading(false)
  }

  if (mensagem) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFEF' }}>
      <div className="rounded-xl shadow-xl w-full max-w-sm overflow-hidden" style={{ background: PRIMARY }}>
        <div className="px-6 pt-8 pb-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">Verifique seu email</p>
          <p className="text-sm" style={{ color: ACCENT }}>{mensagem}</p>
          <button onClick={() => { setMensagem(''); setModo('login') }} className="text-xs hover:underline" style={{ color: ACCENT }}>
            Voltar ao login
          </button>
        </div>
        <div className="flex justify-center pb-5">
          <Image src="/logo_saacs_sem_slogan.png" alt="SAACS" width={74} height={20} className="object-contain" style={{ opacity: 0.7 }} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFEF' }}>
      <div className="rounded-xl shadow-xl w-full max-w-sm overflow-hidden" style={{ background: PRIMARY }}>

        {/* Logo */}
        <div className="px-6 pt-8 pb-5 flex flex-col items-center gap-2">
          <Image
            src="/logo_fonte.jpg"
            alt="CooperLiga"
            width={220}
            height={40}
            className="object-contain"
            priority
          />
          <p className="text-xs tracking-wide" style={{ color: ACCENT }}>Gestão Logística</p>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }} />

        {/* Form */}
        <div className="px-6 py-6">
          <div className="mb-5">
            <p className="text-base font-semibold text-white">
              {modo === 'login' ? 'Acessar sistema' : 'Recuperar senha'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: ACCENT }}>
              {modo === 'login' ? 'Entre com seu email e senha.' : 'Informe seu email para receber o link.'}
            </p>
          </div>

          {modo === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none border-2 border-transparent focus:border-white/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Senha</label>
                <input
                  type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  required
                  className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none border-2 border-transparent focus:border-white/40"
                />
                <button
                  type="button"
                  onClick={() => { setModo('recuperar'); setErro('') }}
                  className="mt-1.5 text-xs hover:underline float-right"
                  style={{ color: ACCENT }}
                >
                  Esqueci minha senha
                </button>
              </div>
              {erro && (
                <p className="text-xs rounded-lg p-2 clear-both" style={{ background: 'rgba(255,255,255,0.12)', color: '#fca5a5' }}>
                  {erro}
                </p>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full text-sm font-semibold rounded-lg py-2.5 disabled:opacity-60 transition-all clear-both"
                style={{ background: loading ? 'white' : ACCENT, color: PRIMARY }}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecuperar} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none border-2 border-transparent focus:border-white/40"
                />
              </div>
              {erro && (
                <p className="text-xs rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.12)', color: '#fca5a5' }}>
                  {erro}
                </p>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-opacity"
                style={{ background: 'white', color: PRIMARY }}
              >
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
              <button
                type="button"
                onClick={() => { setModo('login'); setErro('') }}
                className="w-full text-xs hover:underline"
                style={{ color: ACCENT }}
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }} />

        {/* Footer */}
        <div className="flex justify-center py-4">
          <Image src="/logo_saacs_sem_slogan.png" alt="SAACS" width={74} height={20} className="object-contain" style={{ opacity: 0.7 }} />
        </div>

      </div>
    </div>
  )
}
