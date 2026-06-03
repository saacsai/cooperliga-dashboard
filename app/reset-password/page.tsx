'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

export default function ResetPasswordPage() {
  const [pronto, setPronto]       = useState(false)
  const [senha, setSenha]         = useState('')
  const [confirma, setConfirma]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [erro, setErro]           = useState('')
  const [ok, setOk]               = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setPronto(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== confirma) { setErro('As senhas não coincidem.'); return }
    if (senha.length < 6)   { setErro('Mínimo 6 caracteres.'); return }
    setLoading(true)
    setErro('')
    const { error } = await getSupabase().auth.updateUser({ password: senha })
    if (error) { setErro(error.message); setLoading(false); return }
    setOk(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5EFEF' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Definir senha</h1>
        <p className="text-sm text-gray-500 mb-6">Crie uma senha para acessar o sistema.</p>

        {ok ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
            Senha definida! Redirecionando…
          </p>
        ) : !pronto ? (
          <p className="text-sm text-gray-400">Verificando link…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nova senha</label>
              <input
                type="password" value={senha} onChange={e => setSenha(e.target.value)}
                required autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-[#5C0F0F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar senha</label>
              <input
                type="password" value={confirma} onChange={e => setConfirma(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-[#5C0F0F]"
              />
            </div>
            {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              {loading ? 'Salvando…' : 'Salvar senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
