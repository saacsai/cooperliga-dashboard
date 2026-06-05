'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { buscarCNPJ } from '@/lib/useCNPJLookup'
import { buscarCEP } from '@/lib/useCEPLookup'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import type { Agregado } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

const TIPOS_VEICULO = ['iveco', 'hr', 'fiorino', 'outro']
const TIPO_LABEL: Record<string, string> = { iveco: 'Iveco', hr: 'HR', fiorino: 'Fiorino', outro: 'Outro' }

const VAZIO = {
  nome: '', cpf_cnpj: '', chave_pix: '', whatsapp: '',
  veiculo_placa: '', veiculo_tipo: '',
  razao_social: '', endereco: '', municipio: '', cep: '',
}

const COLUNAS_IMPORT = [
  { key: 'nome',          label: 'Nome' },
  { key: 'cpf_cnpj',      label: 'CPF / CNPJ' },
  { key: 'razao_social',  label: 'Razão Social' },
  { key: 'municipio',     label: 'Município' },
  { key: 'cep',           label: 'CEP' },
  { key: 'endereco',      label: 'Endereço' },
  { key: 'whatsapp',      label: 'WhatsApp' },
  { key: 'chave_pix',     label: 'Chave PIX' },
  { key: 'veiculo_placa', label: 'Placa' },
  { key: 'veiculo_tipo',  label: 'Tipo Veículo' },
]

export default function AgregadosPage() {
  const [agregados,    setAgregados]    = useState<Agregado[]>([])
  const [loading,      setLoading]      = useState(true)
  const [drawer,       setDrawer]       = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [salvando,     setSalvando]     = useState(false)
  const [erro,         setErro]         = useState('')
  const [form,         setForm]         = useState(VAZIO)
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false)
  const [buscandoCEP,  setBuscandoCEP]  = useState(false)
  const [busca,        setBusca]        = useState('')
  const [filtroVeiculo, setFiltroVeiculo] = useState('')

  const contagemVeiculo = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of agregados) {
      const t = a.veiculo_tipo || 'sem_tipo'
      map[t] = (map[t] ?? 0) + 1
    }
    return map
  }, [agregados])

  const agregadosFiltrados = useMemo(() => {
    return agregados.filter(a => {
      if (filtroVeiculo && (a.veiculo_tipo || '') !== filtroVeiculo) return false
      if (!busca.trim()) return true
      const q = busca.toLowerCase()
      return (
        a.nome.toLowerCase().includes(q) ||
        (a.veiculo_placa || '').toLowerCase().includes(q) ||
        (a.whatsapp || '').includes(q) ||
        (a.municipio || '').toLowerCase().includes(q)
      )
    })
  }, [agregados, busca, filtroVeiculo])

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  const [linkCopiado, setLinkCopiado] = useState<string | null>(null)

  function copiarLink(a: Agregado) {
    if (!a.access_token) return
    const url = `${window.location.origin}/portal/${a.access_token}`
    navigator.clipboard.writeText(url)
    setLinkCopiado(a.id)
    setTimeout(() => setLinkCopiado(null), 2000)
  }

  async function carregar() {
    const { data } = await getSupabase().from('agregados').select('*').order('nome')
    setAgregados(data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(a: Agregado) {
    setEditId(a.id)
    setForm({
      nome:          a.nome,
      cpf_cnpj:      a.cpf_cnpj      || '',
      chave_pix:     a.chave_pix     || '',
      whatsapp:      a.whatsapp      || '',
      veiculo_placa: a.veiculo_placa || '',
      veiculo_tipo:  a.veiculo_tipo  || '',
      razao_social:  a.razao_social  || '',
      endereco:      a.endereco      || '',
      municipio:     a.municipio     || '',
      cep:           a.cep           || '',
    })
    setErro(''); setDrawer(true)
  }

  async function handleCNPJBlur() {
    const digits = form.cpf_cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCNPJ(true)
    const dados = await buscarCNPJ(form.cpf_cnpj)
    if (dados) {
      setForm(p => ({
        ...p,
        razao_social: dados.razao_social || p.razao_social,
        nome:         p.nome || dados.nome_fantasia || dados.razao_social,
        endereco:     dados.endereco || p.endereco,
        municipio:    dados.municipio || p.municipio,
        cep:          dados.cep || p.cep,
      }))
    }
    setBuscandoCNPJ(false)
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

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome:          form.nome,
      cpf_cnpj:      form.cpf_cnpj      || null,
      chave_pix:     form.chave_pix     || null,
      whatsapp:      form.whatsapp      || null,
      veiculo_placa: form.veiculo_placa || null,
      veiculo_tipo:  form.veiculo_tipo  || null,
      razao_social:  form.razao_social  || null,
      endereco:      form.endereco      || null,
      municipio:     form.municipio     || null,
      cep:           form.cep           || null,
    }
    const { error } = editId
      ? await getSupabase().from('agregados').update(payload).eq('id', editId)
      : await getSupabase().from('agregados').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const payload = rows.filter(r => r.nome).map(r => ({
      nome:          r.nome,
      cpf_cnpj:      r.cpf_cnpj      || null,
      razao_social:  r.razao_social  || null,
      municipio:     r.municipio     || null,
      cep:           r.cep           || null,
      endereco:      r.endereco      || null,
      whatsapp:      r.whatsapp      || null,
      chave_pix:     r.chave_pix     || null,
      veiculo_placa: r.veiculo_placa || null,
      veiculo_tipo:  r.veiculo_tipo  || null,
    }))
    const { error } = await getSupabase().from('agregados').insert(payload)
    if (error) throw new Error(error.message)
    carregar()
  }

  async function handleExcluir(a: Agregado) {
    if (!confirm(`Excluir o agregado "${a.nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await getSupabase().from('agregados').delete().eq('id', a.id)
    if (error) {
      alert(error.message.includes('foreign key')
        ? `Não é possível excluir "${a.nome}" pois existem rotas vinculadas.`
        : `Erro ao excluir: ${error.message}`)
      return
    }
    setAgregados(prev => prev.filter(x => x.id !== a.id))
  }

  async function toggleAtivo(a: Agregado) {
    await getSupabase().from('agregados').update({ ativo: !a.ativo }).eq('id', a.id)
    carregar()
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agregados</h1>
          <p className="text-sm text-gray-500 mt-0.5">Motoristas e transportadores parceiros</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Novo agregado
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, placa ou município…"
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
        </div>
        <select value={filtroVeiculo} onChange={e => setFiltroVeiculo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
          <option value="">Todos os veículos</option>
          {TIPOS_VEICULO.map(t => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]} ({contagemVeiculo[t] ?? 0})
            </option>
          ))}
        </select>
        {(busca || filtroVeiculo) && (
          <button onClick={() => { setBusca(''); setFiltroVeiculo('') }}
            className="text-xs text-gray-400 hover:text-gray-700">Limpar</button>
        )}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {(busca || filtroVeiculo) ? `${agregadosFiltrados.length} de ${agregados.length}` : `${agregados.length} agregados`}
          </span>
        )}
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Placa</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">WhatsApp</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Chave PIX</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {agregadosFiltrados.map(a => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{a.nome}</span>
                    {a.razao_social && a.razao_social !== a.nome && (
                      <span className="block text-xs text-gray-400">{a.razao_social}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{a.veiculo_placa || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.veiculo_tipo ? TIPO_LABEL[a.veiculo_tipo] || a.veiculo_tipo : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.whatsapp || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.chave_pix || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {a.access_token && (
                        <button
                          onClick={() => copiarLink(a)}
                          title="Copiar link do portal do agregado"
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          {linkCopiado === a.id ? '✓ Copiado' : 'Portal'}
                        </button>
                      )}
                      <button onClick={() => abrirEditar(a)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(a)} className="text-xs text-gray-400 hover:text-gray-700">{a.ativo ? 'Desativar' : 'Ativar'}</button>
                      <button onClick={() => handleExcluir(a)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {agregadosFiltrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  {busca ? 'Nenhum agregado encontrado para esta busca.' : 'Nenhum agregado cadastrado.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar agregado' : 'Novo agregado'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CPF / CNPJ</label>
            <input type="text" value={form.cpf_cnpj} onChange={set('cpf_cnpj')} onBlur={handleCNPJBlur}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            {buscandoCNPJ && <p className="text-xs text-gray-400 mt-0.5">Buscando CNPJ…</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social</label>
            <input type="text" value={form.razao_social} onChange={set('razao_social')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Placa</label>
              <input type="text" value={form.veiculo_placa} onChange={set('veiculo_placa')} placeholder="ABC-1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono uppercase" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de veículo</label>
              <select value={form.veiculo_tipo} onChange={set('veiculo_tipo')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]">
                <option value="">Selecione…</option>
                {TIPOS_VEICULO.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
            <input type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-9999"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Chave PIX</label>
            <input type="text" value={form.chave_pix} onChange={set('chave_pix')} placeholder="CPF, e-mail ou chave aleatória"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)} className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
