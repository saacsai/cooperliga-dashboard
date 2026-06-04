'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import ImportarLote from '@/components/ImportarLote'
import { buscarCEP } from '@/lib/useCEPLookup'
import type { PontoDeEntrega } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'
const POR_PAGINA = 50

type Opcao = { value: string; label: string; count?: number }

const VAZIO = {
  nome: '', codigo_interno: '', codigo_estado: '', codigo_prefeitura: '',
  bairro: '', cep: '', municipio: '', endereco: '', contato_nome: '',
}

const COLUNAS_IMPORT = [
  { key: 'nome',              label: 'Nome' },
  { key: 'codigo_prefeitura', label: 'Cód. Prefeitura' },
  { key: 'codigo_estado',     label: 'Cód. Estado' },
  { key: 'codigo_interno',    label: 'Cód. Interno' },
  { key: 'cep',               label: 'CEP' },
  { key: 'bairro',            label: 'Bairro' },
  { key: 'municipio',         label: 'Município' },
  { key: 'endereco',          label: 'Endereço' },
  { key: 'contato_nome',      label: 'Contato' },
]

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ label, options, selected, onChange }: {
  label: string
  options: Opcao[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }

  const label_ = selected.length > 0
    ? `${label}: ${selected.length} selecionado${selected.length > 1 ? 's' : ''}`
    : `${label}: Todos`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white transition-colors ${
          selected.length > 0
            ? 'border-[#5C0F0F] text-[#5C0F0F]'
            : 'border-gray-300 text-gray-700 hover:border-gray-400'
        }`}
      >
        {label_}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[220px] max-h-64 overflow-y-auto">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border-b border-gray-100"
            >
              Limpar seleção
            </button>
          )}
          {options.length === 0 && (
            <p className="px-3 py-3 text-xs text-gray-400">Nenhuma opção disponível</p>
          )}
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-[#5C0F0F]"
              />
              <span className="text-sm text-gray-700 flex-1">{opt.label}</span>
              {opt.count !== undefined && (
                <span className="text-xs text-gray-400 tabular-nums">{opt.count}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PontosDeEntregaPage() {
  const [pontos,        setPontos]        = useState<PontoDeEntrega[]>([])
  const [total,         setTotal]         = useState(0)
  const [pagina,        setPagina]        = useState(0)
  const [opcoesBairro,  setOpcoesBairro]  = useState<Opcao[]>([])
  const [opcoesRegiao,  setOpcoesRegiao]  = useState<Opcao[]>([])
  const [loading,       setLoading]       = useState(true)
  const [drawer,        setDrawer]        = useState(false)
  const [editId,        setEditId]        = useState<string | null>(null)
  const [salvando,      setSalvando]      = useState(false)
  const [erro,          setErro]          = useState('')
  const [form,          setForm]          = useState(VAZIO)
  const [busca,         setBusca]         = useState('')
  const [bairrosFiltro, setBairrosFiltro] = useState<string[]>([])
  const [regioesFiltro, setRegioesFiltro] = useState<string[]>([])
  const [buscandoCEP,   setBuscandoCEP]   = useState(false)
  const buscaTimer = useRef<ReturnType<typeof setTimeout>>()

  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const temFiltro = busca.trim() !== '' || bairrosFiltro.length > 0 || regioesFiltro.length > 0

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  // ── Carregar opções de filtro (bairros + regiões) ───────────────────────────
  async function carregarOpcoes() {
    const [{ data: bairrosData }, { data: rotasData }] = await Promise.all([
      getSupabase().from('pontos_de_entrega').select('bairro').not('bairro', 'is', null).neq('bairro', '').eq('ativo', true),
      getSupabase().from('rotas').select('regiao').not('regiao', 'is', null).neq('regiao', '').eq('ativo', true),
    ])

    const contagemBairro: Record<string, number> = {}
    for (const row of (bairrosData || [])) {
      if (row.bairro) contagemBairro[row.bairro] = (contagemBairro[row.bairro] || 0) + 1
    }
    setOpcoesBairro(
      Object.entries(contagemBairro)
        .map(([b, c]) => ({ value: b, label: b, count: c }))
        .sort((a, b) => b.count! - a.count!)
    )

    const regioes = Array.from(new Set((rotasData || []).map((r: any) => r.regiao).filter(Boolean))) as string[]
    setOpcoesRegiao(regioes.sort().map(r => ({ value: r, label: r })))
  }

  // ── Carregar pontos (paginado + filtros server-side) ────────────────────────
  const carregar = useCallback(async (
    pag: number, q: string, bairros: string[], regioes: string[]
  ) => {
    setLoading(true)

    // Resolver IDs de PDEs a partir das regiões selecionadas
    let pdeIdsRegiao: string[] | null = null
    if (regioes.length > 0) {
      const { data: rotasData } = await getSupabase()
        .from('rotas').select('id').in('regiao', regioes)
      const rotaIds = (rotasData || []).map((r: any) => r.id)
      if (rotaIds.length > 0) {
        const { data: rpData } = await getSupabase()
          .from('rota_pontos').select('ponto_de_entrega_id').in('rota_id', rotaIds)
        pdeIdsRegiao = Array.from(new Set((rpData || []).map((r: any) => r.ponto_de_entrega_id as string)))
      } else {
        pdeIdsRegiao = []
      }
    }

    if (pdeIdsRegiao !== null && pdeIdsRegiao.length === 0) {
      setPontos([]); setTotal(0); setLoading(false); return
    }

    const from = pag * POR_PAGINA
    const to   = from + POR_PAGINA - 1
    let query = getSupabase()
      .from('pontos_de_entrega')
      .select('*', { count: 'exact' })
      .order('nome')
      .range(from, to)

    const term = q.trim()
    if (term) {
      query = query.or(
        `nome.ilike.%${term}%,codigo_estado.ilike.%${term}%,codigo_prefeitura.ilike.%${term}%,municipio.ilike.%${term}%,bairro.ilike.%${term}%`
      )
    }
    if (bairros.length > 0)       query = query.in('bairro', bairros)
    if (pdeIdsRegiao !== null)     query = query.in('id', pdeIdsRegiao)

    const { data, count } = await query
    setPontos((data || []) as unknown as PontoDeEntrega[])
    setTotal(count || 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar(0, '', [], [])
    carregarOpcoes()
  }, [carregar])

  function handleBuscaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setBusca(q); setPagina(0)
    clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(() => carregar(0, q, bairrosFiltro, regioesFiltro), 400)
  }

  function handleBairros(v: string[]) {
    setBairrosFiltro(v); setPagina(0); carregar(0, busca, v, regioesFiltro)
  }

  function handleRegioes(v: string[]) {
    setRegioesFiltro(v); setPagina(0); carregar(0, busca, bairrosFiltro, v)
  }

  function handlePagina(nova: number) {
    setPagina(nova); carregar(nova, busca, bairrosFiltro, regioesFiltro)
  }

  function limparFiltros() {
    setBusca(''); setBairrosFiltro([]); setRegioesFiltro([]); setPagina(0)
    carregar(0, '', [], [])
  }

  // ── CEP lookup ──────────────────────────────────────────────────────────────
  async function handleCEPBlur() {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCEP(true)
    const dados = await buscarCEP(digits)
    if (dados) {
      setForm(p => ({
        ...p,
        cep:       dados.cep,
        bairro:    p.bairro    || dados.bairro,
        endereco:  p.endereco  || dados.logradouro,
        municipio: p.municipio || `${dados.municipio} - ${dados.uf}`,
      }))
    }
    setBuscandoCEP(false)
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────
  function abrirNovo() {
    setEditId(null); setForm(VAZIO); setErro(''); setDrawer(true)
  }

  function abrirEditar(p: PontoDeEntrega) {
    setEditId(p.id)
    setForm({
      nome:              p.nome,
      codigo_interno:    p.codigo_interno    || '',
      codigo_estado:     p.codigo_estado     || '',
      codigo_prefeitura: p.codigo_prefeitura || '',
      bairro:            p.bairro            || '',
      cep:               p.cep               || '',
      municipio:         p.municipio         || '',
      endereco:          p.endereco          || '',
      contato_nome:      p.contato_nome      || '',
    })
    setErro(''); setDrawer(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome:              form.nome,
      codigo_interno:    form.codigo_interno    || null,
      codigo_estado:     form.codigo_estado     || null,
      codigo_prefeitura: form.codigo_prefeitura || null,
      bairro:            form.bairro            || null,
      cep:               form.cep               || null,
      municipio:         form.municipio         || null,
      endereco:          form.endereco          || null,
      contato_nome:      form.contato_nome      || null,
    }
    const { error } = editId
      ? await getSupabase().from('pontos_de_entrega').update(payload).eq('id', editId)
      : await getSupabase().from('pontos_de_entrega').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    setDrawer(false); setSalvando(false)
    carregar(pagina, busca, bairrosFiltro, regioesFiltro)
    carregarOpcoes()
  }

  async function handleExcluir(p: PontoDeEntrega) {
    if (!confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await getSupabase().from('pontos_de_entrega').delete().eq('id', p.id)
    if (error) {
      alert(error.message.includes('foreign key')
        ? `Não é possível excluir "${p.nome}" pois existem rotas ou entregas vinculadas.`
        : `Erro ao excluir: ${error.message}`)
      return
    }
    setPontos(prev => prev.filter(x => x.id !== p.id))
  }

  async function handleImportar(rows: Record<string, string>[]) {
    const payload = rows.filter(r => r.nome).map(r => ({
      nome:              r.nome,
      codigo_prefeitura: r.codigo_prefeitura || null,
      codigo_estado:     r.codigo_estado     || null,
      codigo_interno:    r.codigo_interno    || null,
      cep:               r.cep               || null,
      bairro:            r.bairro            || null,
      municipio:         r.municipio         || null,
      endereco:          r.endereco          || null,
      contato_nome:      r.contato_nome      || null,
    }))
    const { error } = await getSupabase()
      .from('pontos_de_entrega')
      .upsert(payload, { onConflict: 'codigo_prefeitura' })
    if (error) throw new Error(error.message)
    carregar(0, busca, bairrosFiltro, regioesFiltro)
    carregarOpcoes()
  }

  async function toggleAtivo(p: PontoDeEntrega) {
    await getSupabase().from('pontos_de_entrega').update({ ativo: !p.ativo }).eq('id', p.id)
    carregar(pagina, busca, bairrosFiltro, regioesFiltro)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pontos de Entrega</h1>
          <p className="text-sm text-gray-500 mt-0.5">Escolas, creches e unidades receptoras</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportarLote colunas={COLUNAS_IMPORT} onImportar={handleImportar} primaryColor={PRIMARY} />
          <button onClick={abrirNovo} className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity" style={{ background: PRIMARY }}>
            + Novo ponto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={busca}
            onChange={handleBuscaChange}
            placeholder="Buscar por nome, código, bairro…"
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F] w-64"
          />
        </div>

        <MultiSelect label="Bairro"  options={opcoesBairro} selected={bairrosFiltro} onChange={handleBairros} />
        <MultiSelect label="Região"  options={opcoesRegiao} selected={regioesFiltro} onChange={handleRegioes} />

        {temFiltro && (
          <button onClick={limparFiltros} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
            Limpar filtros
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {!loading && (temFiltro ? `${total} encontrados` : `${total} pontos`)}
        </span>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Bairro</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cód. Prefeitura</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Município</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pontos.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.bairro || '—'}</td>
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
                        <button onClick={() => handleExcluir(p)} className="text-xs text-red-400 hover:text-red-600">Excluir</button>
                        <button onClick={() => toggleAtivo(p)} className="text-xs text-gray-400 hover:text-gray-700">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pontos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      {temFiltro ? 'Nenhum ponto encontrado para este filtro.' : 'Nenhum ponto de entrega cadastrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => handlePagina(pagina - 1)}
                disabled={pagina === 0}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <span className="text-xs text-gray-500">
                Página {pagina + 1} de {totalPaginas} · {total} pontos
              </span>
              <button
                onClick={() => handlePagina(pagina + 1)}
                disabled={pagina >= totalPaginas - 1}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próximo →
              </button>
            </div>
          )}
        </>
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
                CEP{buscandoCEP && <span className="text-gray-400 font-normal ml-1">buscando…</span>}
              </label>
              <input type="text" value={form.cep} onChange={set('cep')} onBlur={handleCEPBlur}
                placeholder="00000-000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
              <input type="text" value={form.bairro} onChange={set('bairro')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Município</label>
              <input type="text" value={form.municipio} onChange={set('municipio')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
            </div>
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
