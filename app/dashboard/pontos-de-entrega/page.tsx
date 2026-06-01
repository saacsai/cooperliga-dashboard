'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import { buscarCEP } from '@/lib/useCEPLookup'
import type { PontoDeEntrega } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

type RotaItem = { id: string; nome: string }
type RotaPonto = { rota_id: string; ponto_de_entrega_id: string }

const VAZIO = { nome: '', codigo_interno: '', codigo_estado: '', codigo_prefeitura: '', endereco: '', municipio: '', cep: '', contato_nome: '' }

const COLUNAS_IMPORT = [
  { key: 'nome',              label: 'Nome' },
  { key: 'codigo_prefeitura', label: 'Cód. Prefeitura' },
  { key: 'codigo_estado',     label: 'Cód. Estado' },
  { key: 'codigo_interno',    label: 'Cód. Interno' },
  { key: 'cep',               label: 'CEP' },
  { key: 'municipio',         label: 'Município' },
  { key: 'endereco',          label: 'Endereço' },
  { key: 'contato_nome',      label: 'Contato' },
]

export default function PontosDeEntregaPage() {
  const [pontos,     setPontos]     = useState<PontoDeEntrega[]>([])
  const [rotas,      setRotas]      = useState<RotaItem[]>([])
  const [rotaPontos, setRotaPontos] = useState<RotaPonto[]>([])
  const [loading,    setLoading]    = useState(true)
  const [drawer,     setDrawer]     = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [salvando,   setSalvando]   = useState(false)
  const [erro,       setErro]       = useState('')
  const [form,       setForm]       = useState(VAZIO)

  const [busca,      setBusca]      = useState('')
  const [rotaFiltro, setRotaFiltro] = useState('')
  const [buscandoCEP, setBuscandoCEP] = useState(false)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  async function handleCEPBlur() {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCEP(true)
    const dados = await buscarCEP(digits)
    if (dados) {
      setForm(p => ({
        ...p,
        cep: dados.cep,
        endereco: p.endereco || `${dados.logradouro}${dados.bairro ? ', ' + dados.bairro : ''}`.trim(),
        municipio: p.municipio || `${dados.municipio} - ${dados.uf}`,
      }))
    }
    setBuscandoCEP(false)
  }

  async function carregar() {
    const [{ data: p }, { data: r }, { data: rp }] = await Promise.all([
      getSupabase().from('pontos_de_entrega').select('*').order('nome'),
      getSupabase().from('rotas').select('id, nome').order('nome'),
      getSupabase().from('rota_pontos').select('rota_id, ponto_de_entrega_id'),
    ])
    setPontos((p || []) as unknown as PontoDeEntrega[])
    setRotas(r || [])
    setRotaPontos(rp || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const pontosFiltrados = useMemo(() => {
    let result = pontos

    if (busca.trim()) {
      const q = busca.toLowerCase()
      result = result.filter(p =>
        p.nome.toLowerCase().includes(q) ||
        (p.codigo_estado || '').toLowerCase().includes(q) ||
        (p.codigo_prefeitura || '').toLowerCase().includes(q) ||
        (p.municipio || '').toLowerCase().includes(q)
      )
    }

    if (rotaFiltro) {
      const ids = new Set(
        rotaPontos
          .filter(rp => rp.rota_id === rotaFiltro)
          .map(rp => rp.ponto_de_entrega_id)
      )
      result = result.filter(p => ids.has(p.id))
    }

    return result
  }, [pontos, busca, rotaFiltro, rotaPontos])

  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(p: PontoDeEntrega) {
    setEditId(p.id)
    setForm({
      nome: p.nome, codigo_interno: p.codigo_interno || '',
      codigo_estado: p.codigo_estado || '', codigo_prefeitura: p.codigo_prefeitura || '',
      endereco: p.endereco || '', municipio: p.municipio || '',
      cep: p.cep || '', contato_nome: p.contato_nome || '',
    })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome: form.nome,
      codigo_interno: form.codigo_interno || null,
      codigo_estado: form.codigo_estado || null,
      codigo_prefeitura: form.codigo_prefeitura || null,
      endereco: form.endereco || null,
      municipio: form.municipio || null,
      cep: form.cep || null,
      contato_nome: form.contato_nome || null,
    }
    const { error } = editId
      ? await getSupabase().from('pontos_de_entrega').update(payload).eq('id', editId)
      : await getSupabase().from('pontos_de_entrega').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false); carregar()
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const payload = rows.filter(r => r.nome).map(r => ({
      nome:              r.nome,
      codigo_prefeitura: r.codigo_prefeitura || null,
      codigo_estado:     r.codigo_estado     || null,
      codigo_interno:    r.codigo_interno    || null,
      cep:               r.cep               || null,
      municipio:         r.municipio         || null,
      endereco:          r.endereco          || null,
      contato_nome:      r.contato_nome      || null,
    }))
    const { error } = await getSupabase()
      .from('pontos_de_entrega')
      .upsert(payload, { onConflict: 'codigo_prefeitura' })
    if (error) throw new Error(error.message)
    carregar()
  }

  async function toggleAtivo(p: PontoDeEntrega) {
    await getSupabase().from('pontos_de_entrega').update({ ativo: !p.ativo }).eq('id', p.id)
    carregar()
  }

  const temFiltro = busca.trim() !== '' || rotaFiltro !== ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pontos de Entrega</h1>
          <p className="text-sm text-gray-500 mt-0.5">Escolas, creches e unidades receptoras</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Novo ponto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou município…"
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]"
          />
        </div>

        <select
          value={rotaFiltro}
          onChange={e => setRotaFiltro(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white text-gray-700"
        >
          <option value="">Todas as regiões</option>
          {rotas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>

        {temFiltro && (
          <button
            onClick={() => { setBusca(''); setRotaFiltro('') }}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Limpar
          </button>
        )}

        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {temFiltro
              ? `${pontosFiltrados.length} de ${pontos.length}`
              : `${pontos.length} pontos`}
          </span>
        )}
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Prefeitura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Município</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pontosFiltrados.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.codigo_estado || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.codigo_prefeitura || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.municipio || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                      <button onClick={() => toggleAtivo(p)} className="text-xs text-gray-400 hover:text-gray-700">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pontosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    {temFiltro ? 'Nenhum ponto encontrado para este filtro.' : 'Nenhum ponto de entrega cadastrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar ponto de entrega' : 'Novo ponto de entrega'} width={480}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={set('nome')} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Estado (CIE)</label>
              <input type="text" value={form.codigo_estado} onChange={set('codigo_estado')} placeholder="ex: 923370"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Prefeitura</label>
              <input type="text" value={form.codigo_prefeitura} onChange={set('codigo_prefeitura')} placeholder="ex: 12716"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cód. Interno</label>
              <input type="text" value={form.codigo_interno} onChange={set('codigo_interno')} placeholder="ex: R03-04"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                CEP {buscandoCEP && <span className="text-gray-400 font-normal">buscando…</span>}
              </label>
              <input type="text" value={form.cep} onChange={set('cep')} onBlur={handleCEPBlur}
                placeholder="00000-000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
              <input type="text" value={form.municipio} onChange={set('municipio')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div className="col-span-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
            <input type="text" value={form.endereco} onChange={set('endereco')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contato</label>
            <input type="text" value={form.contato_nome} onChange={set('contato_nome')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50" style={{ background: PRIMARY }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
