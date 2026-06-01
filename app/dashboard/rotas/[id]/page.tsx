'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PRIMARY = '#5C0F0F'

type AgregadoItem  = { id: string; nome: string }
type ContratoItem  = { id: string; codigo: string | null; orgao: string }
type PontoItem = {
  uid: string // local key for dnd (may differ from rota_pontos.id for new items)
  rota_ponto_id: string | null
  ponto_de_entrega_id: string
  nome: string
  codigo_prefeitura: string | null
  codigo_estado: string | null
  municipio: string | null
}

type RotaForm = {
  contrato_id: string
  codigo: string
  nome: string
  regiao: string
  cep_referencia: string
  agregado_id: string
  valor_frete: string
}

// ─── Sortable row ────────────────────────────────────────────────────────────

function SortableRow({
  item,
  index,
  onRemove,
}: {
  item: PontoItem
  index: number
  onRemove: (uid: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.uid })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50/40 group"
    >
      {/* drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.5"/>
          <circle cx="11" cy="4" r="1.5"/>
          <circle cx="5" cy="8" r="1.5"/>
          <circle cx="11" cy="8" r="1.5"/>
          <circle cx="5" cy="12" r="1.5"/>
          <circle cx="11" cy="12" r="1.5"/>
        </svg>
      </div>

      {/* sequence */}
      <span className="w-6 text-xs font-mono font-semibold text-gray-400 flex-shrink-0 text-right">
        {index + 1}
      </span>

      {/* ponto info */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 block truncate">{item.nome}</span>
        <span className="text-xs text-gray-400">
          {[item.codigo_prefeitura && `Pref. ${item.codigo_prefeitura}`, item.codigo_estado && `Est. ${item.codigo_estado}`, item.municipio].filter(Boolean).join(' · ')}
        </span>
      </div>

      {/* remove */}
      <button
        onClick={() => onRemove(item.uid)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 flex-shrink-0"
        title="Remover da rota"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RotaEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [form, setForm] = useState<RotaForm>({
    contrato_id: '', codigo: '', nome: '', regiao: '', cep_referencia: '', agregado_id: '', valor_frete: '',
  })
  const [agregados, setAgregados] = useState<AgregadoItem[]>([])
  const [contratos, setContratos] = useState<ContratoItem[]>([])
  const [pontos, setPontos] = useState<PontoItem[]>([])
  const [todosPontos, setTodosPontos] = useState<PontoItem[]>([])

  const [busca, setBusca] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const setField = (f: keyof RotaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(p => ({ ...p, [f]: e.target.value }))
    setDirty(true)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    async function carregar() {
      const [{ data: rota }, { data: rp }, { data: ag }, { data: pde }, { data: co }] = await Promise.all([
        getSupabase().from('rotas').select('*').eq('id', id).single(),
        getSupabase()
          .from('rota_pontos')
          .select('id, sequencia, ponto_de_entrega_id, pontos_de_entrega(nome, codigo_prefeitura, codigo_estado, municipio)')
          .eq('rota_id', id)
          .order('sequencia'),
        getSupabase().from('agregados').select('id, nome').eq('ativo', true).order('nome'),
        getSupabase().from('pontos_de_entrega').select('id, nome, codigo_prefeitura, codigo_estado, municipio').eq('ativo', true).order('nome'),
        getSupabase().from('contratos').select('id, codigo, orgao').eq('ativo', true).order('orgao'),
      ])

      if (!rota) { router.push('/dashboard/rotas'); return }

      setForm({
        contrato_id:    rota.contrato_id     || '',
        codigo:         rota.codigo,
        nome:           rota.nome,
        regiao:         rota.regiao          || '',
        cep_referencia: rota.cep_referencia  || '',
        agregado_id:    rota.agregado_id     || '',
        valor_frete:    rota.valor_frete?.toString() || '',
      })
      setAgregados(ag || [])
      setContratos((co || []) as unknown as ContratoItem[])

      const pontosOrdenados: PontoItem[] = (rp || []).map((r: any) => ({
        uid:                  r.id,
        rota_ponto_id:        r.id,
        ponto_de_entrega_id:  r.ponto_de_entrega_id,
        nome:                 r.pontos_de_entrega?.nome || '',
        codigo_prefeitura:    r.pontos_de_entrega?.codigo_prefeitura || null,
        codigo_estado:        r.pontos_de_entrega?.codigo_estado || null,
        municipio:            r.pontos_de_entrega?.municipio || null,
      }))
      setPontos(pontosOrdenados)

      const todos: PontoItem[] = (pde || []).map((p: any) => ({
        uid:                  p.id,
        rota_ponto_id:        null,
        ponto_de_entrega_id:  p.id,
        nome:                 p.nome,
        codigo_prefeitura:    p.codigo_prefeitura,
        codigo_estado:        p.codigo_estado,
        municipio:            p.municipio,
      }))
      setTodosPontos(todos)

      setLoading(false)
    }
    carregar()
  }, [id])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPontos(prev => {
      const oldIndex = prev.findIndex(p => p.uid === active.id)
      const newIndex = prev.findIndex(p => p.uid === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
    setDirty(true)
  }

  function remover(uid: string) {
    setPontos(prev => prev.filter(p => p.uid !== uid))
    setDirty(true)
  }

  const sugestoes = busca.trim().length >= 1
    ? todosPontos.filter(p => {
        const jaNaRota = pontos.some(rp => rp.ponto_de_entrega_id === p.ponto_de_entrega_id)
        if (jaNaRota) return false
        const q = busca.toLowerCase()
        return (
          p.nome.toLowerCase().includes(q) ||
          (p.codigo_prefeitura || '').includes(q) ||
          (p.codigo_estado || '').includes(q)
        )
      }).slice(0, 8)
    : []

  function adicionarPonto(p: PontoItem) {
    const novoUid = `new_${p.ponto_de_entrega_id}_${Date.now()}`
    setPontos(prev => [...prev, { ...p, uid: novoUid, rota_ponto_id: null }])
    setBusca('')
    setShowSuggestions(false)
    setDirty(true)
  }

  const handleSalvar = useCallback(async () => {
    setSalvando(true)
    setErro('')
    setOk(false)
    const sb = getSupabase()

    try {
      // 1. Salvar metadados da rota
      const { error: errRota } = await sb.from('rotas').update({
        contrato_id:    form.contrato_id    || null,
        codigo:         form.codigo,
        nome:           form.nome,
        regiao:         form.regiao          || null,
        cep_referencia: form.cep_referencia  || null,
        agregado_id:    form.agregado_id     || null,
        valor_frete:    form.valor_frete ? parseFloat(form.valor_frete) : null,
      }).eq('id', id)
      if (errRota) throw new Error(errRota.message)

      // 2. Recriar rota_pontos com nova sequência
      await sb.from('rota_pontos').delete().eq('rota_id', id)
      if (pontos.length > 0) {
        const { error: errPontos } = await sb.from('rota_pontos').insert(
          pontos.map((p, i) => ({
            rota_id:             id,
            ponto_de_entrega_id: p.ponto_de_entrega_id,
            sequencia:           i + 1,
          }))
        )
        if (errPontos) throw new Error(errPontos.message)
      }

      setOk(true)
      setDirty(false)
      setTimeout(() => setOk(false), 2500)
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }, [id, form, pontos])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Carregando rota…</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full min-h-[calc(100vh-4rem)]">

      {/* ── Left panel: metadata ── */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <div>
          <button
            onClick={() => router.push('/dashboard/rotas')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-4 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Voltar a Rotas
          </button>
          <h1 className="text-xl font-bold text-gray-900">{form.nome || 'Rota'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Editar dados e sequência</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contrato</label>
            <select value={form.contrato_id} onChange={setField('contrato_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              <option value="">Sem contrato</option>
              {contratos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} — ` : ''}{c.orgao}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
            <input type="text" value={form.codigo} onChange={setField('codigo')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={setField('nome')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Região</label>
            <input type="text" value={form.regiao} onChange={setField('regiao')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CEP de referência</label>
            <input type="text" value={form.cep_referencia} onChange={setField('cep_referencia')}
              placeholder="ex: 08400" maxLength={9}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Agregado</label>
            <select value={form.agregado_id} onChange={setField('agregado_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
              <option value="">Sem agregado</option>
              {agregados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor do frete (R$)</label>
            <input type="number" step="0.01" value={form.valor_frete} onChange={setField('valor_frete')} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F]" />
          </div>
        </div>

        {/* save */}
        <div className="space-y-2">
          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</p>
          )}
          {ok && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Salvo com sucesso
            </p>
          )}
          <button
            onClick={handleSalvar}
            disabled={salvando || !dirty}
            className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity"
            style={{ background: PRIMARY }}
          >
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
          {dirty && !salvando && (
            <p className="text-xs text-center text-amber-600">Alterações não salvas</p>
          )}
        </div>
      </div>

      {/* ── Right panel: ordered points ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Pontos de entrega</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {pontos.length === 0 ? 'Nenhum ponto adicionado' : `${pontos.length} parada${pontos.length > 1 ? 's' : ''} na sequência`}
            </p>
          </div>
        </div>

        {/* sortable list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col">
          {pontos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <p className="text-sm text-gray-400">Use o campo abaixo para adicionar pontos de entrega</p>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={pontos.map(p => p.uid)} strategy={verticalListSortingStrategy}>
                  {pontos.map((p, i) => (
                    <SortableRow key={p.uid} item={p} index={i} onRemove={remover} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* add point */}
          <div className="border-t border-gray-100 p-4 relative">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={busca}
                onChange={e => { setBusca(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Buscar ponto de entrega para adicionar…"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]"
              />
            </div>

            {showSuggestions && sugestoes.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                {sugestoes.map(p => (
                  <button
                    key={p.ponto_de_entrega_id}
                    onMouseDown={() => adicionarPonto(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-sm font-medium text-gray-900 block">{p.nome}</span>
                    <span className="text-xs text-gray-400">
                      {[p.codigo_prefeitura && `Pref. ${p.codigo_prefeitura}`, p.codigo_estado && `Est. ${p.codigo_estado}`, p.municipio].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showSuggestions && busca.trim().length >= 1 && sugestoes.length === 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20">
                <p className="text-xs text-gray-400 text-center">Nenhum ponto encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
