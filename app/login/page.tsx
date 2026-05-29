'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [modo, setModo]       = useState<'login' | 'recuperar'>('login')
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro]       = useState('')

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
    window.location.href = '/dashboard'
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setErro(error.message); setLoading(false); return }
    setMensagem('Link de recuperação enviado para o seu email.')
    setLoading(false)
  }

  if (mensagem) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFEF' }}>
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-6 pb-5 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Verifique seu email</p>
          <p className="text-sm text-gray-500">{mensagem}</p>
          <button onClick={() => { setMensagem(''); setModo('login') }} className="text-xs hover:underline" style={{ color: PRIMARY }}>
            Voltar ao login
          </button>
        </div>
        <div className="border-t border-gray-100 mx-0" />
        <div className="flex justify-center px-5 py-4">
          <Image src="/logo_saacs.png" alt="SAACS" width={64} height={20} className="object-contain opacity-25" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFEF' }}>
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-sm overflow-hidden">

        {/* Header — logo */}
        <div className="px-5 pt-6 pb-5 flex flex-col items-center gap-2">
          <div
            className="rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: PRIMARY, width: 160, height: 52 }}
          >
            <Image
              src="/cooperliga_logo.jpg"
              alt="CooperLiga"
              width={160}
              height={52}
              className="object-contain"
              priority
            />
          </div>
          <p className="text-xs" style={{ color: '#D4A0A0', letterSpacing: '0.04em' }}>Gestão Logística</p>
        </div>

        <div className="border-t border-gray-100" />

        {/* Form */}
        <div className="px-5 py-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900">
              {modo === 'login' ? 'Acessar sistema' : 'Recuperar senha'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {modo === 'login' ? 'Entre com seu email e senha.' : 'Informe seu email para receber o link.'}
            </p>
          </div>

          {modo === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-[#5C0F0F]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
                <input
                  type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-[#5C0F0F]"
                />
                <button
                  type="button"
                  onClick={() => { setModo('recuperar'); setErro('') }}
                  className="mt-1 text-xs hover:underline float-right"
                  style={{ color: PRIMARY }}
                >
                  Esqueci minha senha
                </button>
              </div>
              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 clear-both">{erro}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-opacity clear-both"
                style={{ backgroundColor: PRIMARY }}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecuperar} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-[#5C0F0F]"
                />
              </div>
              {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: PRIMARY }}
              >
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
              <button
                type="button"
                onClick={() => { setModo('login'); setErro('') }}
                className="w-full text-xs text-gray-500 hover:underline"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Footer */}
        <div className="flex justify-center px-5 py-3">
          <Image src="/logo_saacs.png" alt="SAACS" width={64} height={20} className="object-contain opacity-25" />
        </div>

      </div>
    </div>
  )
}
