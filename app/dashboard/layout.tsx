'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { buscarCEP } from '@/lib/useCEPLookup'
import Sidebar from '@/components/Sidebar'
import Drawer from '@/components/Drawer'
import type { Perfil } from '@/lib/supabase'

const SIDEBAR_W = '224px'
const PRIMARY   = '#5C0F0F'

interface PerfilForm {
  nome: string
  whatsapp: string
  cargo: string
  cpf: string
  rg: string
  data_nascimento: string
  municipio: string
  cep: string
  endereco: string
}

const FORM_VAZIO: PerfilForm = {
  nome: '', whatsapp: '', cargo: '', cpf: '', rg: '',
  data_nascimento: '', municipio: '', cep: '', endereco: '',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading,      setLoading]     = useState(true)
  const [userId,       setUserId]      = useState('')
  const [nome,         setNome]        = useState('')
  const [email,        setEmail]       = useState('')
  const [perfil,       setPerfil]      = useState<Perfil>('operador')
  const [drawerPerfil, setDrawerPerfil] = useState(false)
  const [menuMobile,   setMenuMobile]  = useState(false)

  const [form,         setForm]        = useState<PerfilForm>(FORM_VAZIO)
  const [salvando,     setSalvando]    = useState(false)
  const [erroEdit,     setErroEdit]    = useState('')
  const [okEdit,       setOkEdit]      = useState(false)
  const [buscandoCEP,  setBuscandoCEP] = useState(false)

  const set = (f: keyof PerfilForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }

      setEmail(session.user.email || '')
      setUserId(session.user.id)

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome, perfil, whatsapp, cargo, cpf, rg, data_nascimento, municipio, cep, endereco')
        .eq('id', session.user.id)
        .single()

      if (!usuario) {
        await supabase.auth.signOut()
        window.location.href = '/login?erro=sem-acesso'
        return
      }

      setNome(usuario.nome)
      setPerfil(usuario.perfil as Perfil)
      setForm({
        nome:            usuario.nome,
        whatsapp:        usuario.whatsapp        || '',
        cargo:           (usuario as any).cargo  || '',
        cpf:             usuario.cpf             || '',
        rg:              usuario.rg              || '',
        data_nascimento: usuario.data_nascimento || '',
        municipio:       usuario.municipio       || '',
        cep:             usuario.cep             || '',
        endereco:        usuario.endereco        || '',
      })
      setLoading(false)
    })
  }, [])

  async function abrirDrawerPerfil() {
    setErroEdit('')
    setOkEdit(false)
    const { data: usuario } = await getSupabase()
      .from('usuarios')
      .select('nome, whatsapp, cargo, cpf, rg, data_nascimento, municipio, cep, endereco')
      .eq('id', userId)
      .single()
    if (usuario) {
      setForm({
        nome:            usuario.nome            || '',
        whatsapp:        usuario.whatsapp        || '',
        cargo:           (usuario as any).cargo  || '',
        cpf:             usuario.cpf             || '',
        rg:              usuario.rg              || '',
        data_nascimento: usuario.data_nascimento || '',
        municipio:       usuario.municipio       || '',
        cep:             usuario.cep             || '',
        endereco:        usuario.endereco        || '',
      })
    }
    setDrawerPerfil(true)
  }

  async function handleCEPBlur() {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCEP(true)
    const dados = await buscarCEP(form.cep)
    if (dados) {
      setForm(p => ({
        ...p,
        cep:      dados.cep,
        municipio: p.municipio || dados.municipio,
        endereco:  p.endereco  || [dados.logradouro, dados.bairro].filter(Boolean).join(', '),
      }))
    }
    setBuscandoCEP(false)
  }

  async function handleSalvarPerfil(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErroEdit('')
    try {
      const res = await fetch(`/api/admin/usuarios/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:            form.nome,
          whatsapp:        form.whatsapp        || null,
          cargo:           form.cargo           || null,
          cpf:             form.cpf             || null,
          rg:              form.rg              || null,
          data_nascimento: form.data_nascimento || null,
          municipio:       form.municipio       || null,
          cep:             form.cep             || null,
          endereco:        form.endereco        || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErroEdit(json.error || 'Erro ao salvar'); setSalvando(false); return }
      setNome(form.nome)
      setOkEdit(true)
      setSalvando(false)
      setTimeout(() => setDrawerPerfil(false), 1200)
    } catch {
      setErroEdit('Erro de conexão. Tente novamente.')
      setSalvando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5EFEF' }}>
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5EFEF' }}>
      {/* Header mobile */}
      <div className="lg:hidden print:hidden fixed top-0 left-0 right-0 z-20 h-14 flex items-center px-4 gap-3"
        style={{ background: PRIMARY }}>
        <button
          onClick={() => setMenuMobile(true)}
          className="flex flex-col gap-1.5 p-1"
          aria-label="Abrir menu"
        >
          <span className="block w-5 h-0.5 bg-white/80 rounded" />
          <span className="block w-5 h-0.5 bg-white/80 rounded" />
          <span className="block w-5 h-0.5 bg-white/80 rounded" />
        </button>
        <span className="text-white font-bold text-sm tracking-wide">CooperLiga</span>
      </div>

      <div className="print:hidden">
        <Sidebar
          nome={nome}
          email={email}
          perfil={perfil}
          onEditarPerfil={abrirDrawerPerfil}
          mobileAberto={menuMobile}
          onMobileFechar={() => setMenuMobile(false)}
        />
      </div>
      <main className="p-4 lg:p-8 pt-[72px] lg:pt-0 ml-0 lg:ml-[224px] print:ml-0 print:p-4" style={{ minHeight: '100vh' }}>
        {children}
      </main>

      <div className="print:hidden">
      <Drawer open={drawerPerfil} onClose={() => setDrawerPerfil(false)} title="Editar perfil">
        {okEdit ? (
          <div className="py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-sm text-gray-700 font-medium">Salvo com sucesso</p>
          </div>
        ) : (
          <form onSubmit={handleSalvarPerfil} className="space-y-4">
            <p className="text-xs text-gray-400 -mt-1">{email}</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
              <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-9999"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo / Função</label>
              <input type="text" value={form.cargo} onChange={set('cargo')} placeholder="ex: Coordenador de Logística"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dados pessoais</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CPF</label>
                    <input type="text" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">RG</label>
                    <input type="text" value={form.rg} onChange={set('rg')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Data de nascimento</label>
                  <input type="date" value={form.data_nascimento} onChange={set('data_nascimento')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
                    <input type="text" value={form.municipio} onChange={set('municipio')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                    <input type="text" value={form.cep} onChange={set('cep')} onBlur={handleCEPBlur} placeholder="00000-000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                    {buscandoCEP && <p className="text-xs text-gray-400 mt-0.5">Buscando CEP…</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
                  <input type="text" value={form.endereco} onChange={set('endereco')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
              <a href="/reset-password" onClick={() => setDrawerPerfil(false)}
                className="text-xs hover:underline" style={{ color: PRIMARY }}>
                Alterar senha →
              </a>
            </div>

            {erroEdit && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erroEdit}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setDrawerPerfil(false)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={salvando}
                className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: PRIMARY }}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </Drawer>
      </div>
    </div>
  )
}
