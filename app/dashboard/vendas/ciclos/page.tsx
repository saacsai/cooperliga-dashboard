'use client'

import { useEffect, useState, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import Drawer from '@/components/Drawer'
import { CAPACIDADE_VEICULO } from '@/lib/veiculo'
import type { CeafCiclo, CeafEmpresa } from '@/lib/supabase'

const PRIMARY = '#072740'

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  aberto:       { label: 'Aberto',       badge: 'bg-blue-100 text-blue-700' },
  fechado:      { label: 'Pedidos fechados', badge: 'bg-yellow-100 text-yellow-700' },
  consolidado:  { label: 'Consolidado',  badge: 'bg-orange-100 text-orange-700' },
  entregue:     { label: 'Entregue',     badge: 'bg-green-100 text-green-700' },
}

const VEICULOS = Object.entries(CAPACIDADE_VEICULO).map(([key, v]) => ({
  key, label: key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
  min: v.min, max: v.max,
}))

function getMondayStr(offset = 0): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offset * 7)
  return d.toISOString().split('T')[0]
}

function addDays(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function sugerirVeiculo(totalCaixas: number): string {
  for (const [key, cap] of Object.entries(CAPACIDADE_VEICULO)) {
    if (totalCaixas <= cap.max) return key
  }
  return '3_4'
}

const VAZIO = {
  empresa_id: '', semana_ref: getMondayStr(),
  data_cardapio: '', data_fechamento: '', data_entrega: '',
  valor_frete: '', plus_montagem: '', observacao: '',
}

export default function CiclosPage() {
  const [ciclos,    setCiclos]    = useState<CeafCiclo[]>([])
  const [empresas,  setEmpresas]  = useState<Pick<CeafEmpresa, 'id' | 'nome'>[]>([])
  const [loading,   setLoading]   = useState(true)
  const [drawer,    setDrawer]    = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [salvando,  setSalvando]  = useState(false)
  const [erro,      setErro]      = useState('')
  const [form,      setForm]      = useState(VAZIO)

  const set = (f: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  const veiculoSugerido = useMemo(() => {
    const ciclo = editId ? ciclos.find(c => c.id === editId) : null
    const caixas = ciclo?.total_caixas || 0
    if (caixas === 0) return null
    return sugerirVeiculo(caixas)
  }, [editId, ciclos])

  async function carregar() {
    const sb = getSupabase()
    const [{ data: cics }, { data: emps }] = await Promise.all([
      sb.from('ceaf_ciclos').select('*, ceaf_empresas(nome)').order('semana_ref', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('ceaf_empresas').select('id, nome').eq('ativa', true).order('nome'),
    ])
    setCiclos((cics as CeafCiclo[]) || [])
    setEmpresas(emps || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    const seg = getMondayStr()
    setEditId(null)
    setForm({
      ...VAZIO,
      semana_ref: seg,
      data_cardapio: seg,
      data_fechamento: addDays(seg, 2),
      data_entrega: addDays(seg, 4),
    })
    setErro('')
    setDrawer(true)
  }

  function abrirEditar(c: CeafCiclo) {
    setEditId(c.id)
    setForm({
      empresa_id: c.empresa_id || '',
      semana_ref: c.semana_ref,
      data_cardapio: c.data_cardapio || '',
      data_fechamento: c.data_fechamento || '',
      data_entrega: c.data_entrega || '',
      valor_frete: c.valor_frete != null ? String(c.valor_frete) : '',
      plus_montagem: c.plus_montagem != null ? String(c.plus_montagem) : '',
      observacao: c.observacao || '',
    })
    setErro('')
    setDrawer(true)
  }

  async function handleSalvar(ev: React.FormEvent) {
    ev.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      empresa_id: form.empresa_id || null,
      semana_ref: form.semana_ref,
      data_cardapio: form.data_cardapio || null,
      data_fechamento: form.data_fechamento || null,
      data_entrega: form.data_entrega || null,
      valor_frete: form.valor_frete ? parseFloat(form.valor_frete) : null,
      plus_montagem: form.plus_montagem ? parseFloat(form.plus_montagem) : null,
      observacao: form.observacao || null,
    }
    const sb = getSupabase()
    const { error } = editId
      ? await sb.from('ceaf_ciclos').update(payload).eq('id', editId)
      : await sb.from('ceaf_ciclos').insert(payload)
    if (error) { setErro(error.message); setSalvando(false); return }
    await carregar(); setSalvando(false); setDrawer(false)
  }

  async function avancarStatus(c: CeafCiclo) {
    const ordem: CeafCiclo['status'][] = ['aberto', 'fechado', 'consolidado', 'entregue']
    const idx = ordem.indexOf(c.status)
    if (idx >= ordem.length - 1) return
    const next = ordem[idx + 1]
    const update: Record<string, unknown> = { status: next }
    if (next === 'consolidado') update.veiculo_sugerido = sugerirVeiculo(c.total_caixas)
    await getSupabase().from('ceaf_ciclos').update(update).eq('id', c.id)
    carregar()
  }

  const proximoStatus: Record<string, string> = {
    aberto: 'Fechar pedidos',
    fechado: 'Consolidar',
    consolidado: 'Marcar entregue',
    entregue: '',
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-gray-400">Carregando…</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ciclos CEAF</h1>
          <p className="text-xs text-gray-400 mt-0.5">Rodadas semanais da Feira no Trabalho</p>
        </div>
        <button onClick={abrirNovo}
          className="px-4 py-2 rounded-lg text-sm font-medium btn-brand">
          + Novo ciclo
        </button>
      </div>

      {ciclos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhum ciclo cadastrado ainda.</p>
          <button onClick={abrirNovo} className="mt-3 text-sm font-medium" style={{ color: PRIMARY }}>
            Criar primeiro ciclo →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {ciclos.map(c => {
            const config = STATUS_CONFIG[c.status]
            const empresa = c.ceaf_empresas?.nome || '—'
            const veiculo = c.veiculo_sugerido
            const cap = veiculo ? CAPACIDADE_VEICULO[veiculo] : null
            const prox = proximoStatus[c.status]
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badge}`}>
                        {config.label}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{empresa}</span>
                      <span className="text-xs text-gray-400">
                        {c.data_cardapio ? fmtDate(c.data_cardapio) : '—'}
                        {c.data_entrega ? ` → ${fmtDate(c.data_entrega)}` : ''}
                      </span>
                    </div>

                    <div className="flex gap-4 mt-2 flex-wrap">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">{c.total_caixas}</p>
                        <p className="text-xs text-gray-400">caixas</p>
                      </div>
                      {veiculo && cap && (
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-900 capitalize">{veiculo.replace('_', ' ')}</p>
                          <p className="text-xs text-gray-400">veículo sugerido</p>
                          <p className="text-xs text-gray-400">{cap.min}–{cap.max} cx</p>
                        </div>
                      )}
                      {(c.valor_frete || c.plus_montagem) && (
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-900">
                            {fmtMoeda((c.valor_frete || 0) + (c.plus_montagem || 0))}
                          </p>
                          <p className="text-xs text-gray-400">
                            {c.valor_frete ? `frete ${fmtMoeda(c.valor_frete)}` : ''}
                            {c.valor_frete && c.plus_montagem ? ' + ' : ''}
                            {c.plus_montagem ? `montagem ${fmtMoeda(c.plus_montagem)}` : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => abrirEditar(c)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                      Editar
                    </button>
                    {prox && (
                      <button onClick={() => avancarStatus(c)}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium btn-brand">
                        {prox}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={editId ? 'Editar ciclo' : 'Novo ciclo CEAF'}>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Empresa *</label>
            <select value={form.empresa_id} onChange={set('empresa_id')} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]">
              <option value="">Selecione a empresa</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Semana de referência *</label>
            <input type="date" value={form.semana_ref} onChange={set('semana_ref')} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cronograma</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Segunda — Cardápio para WhatsApp</label>
                <input type="date" value={form.data_cardapio} onChange={set('data_cardapio')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quarta — Fechamento de pedidos</label>
                <input type="date" value={form.data_fechamento} onChange={set('data_fechamento')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sexta — Entrega e montagem</label>
                <input type="date" value={form.data_entrega} onChange={set('data_entrega')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financeiro</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Frete (R$)</label>
                <input type="number" min="0" step="0.01" value={form.valor_frete} onChange={set('valor_frete')}
                  placeholder="0,00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plus montagem (R$)</label>
                <input type="number" min="0" step="0.01" value={form.plus_montagem} onChange={set('plus_montagem')}
                  placeholder="0,00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740]" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Plus de montagem = valor pago ao agregado pela montagem individual das cestas no ponto de entrega.</p>
          </div>

          {veiculoSugerido && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700">
                Veículo sugerido: {veiculoSugerido.replace('_', ' ').toUpperCase()}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Capacidade {CAPACIDADE_VEICULO[veiculoSugerido]?.min}–{CAPACIDADE_VEICULO[veiculoSugerido]?.max} caixas
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <textarea value={form.observacao} onChange={set('observacao')} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#072740] resize-none" />
          </div>

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setDrawer(false)}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 btn-brand">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
