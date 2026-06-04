'use client'

import React, { useEffect, useState, useCallback } from 'react'
import QRCode from 'react-qr-code'
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

const AVISO_MOTORISTA = `SR. MOTORISTA: SE HOUVER QUALQUER IMPREVISTO NA ENTREGA COMO:
*RECUSA DE BANANA POR ESTAR MUITO MADURA, VERDE OU QUALQUER OUTRO PROBLEMA.
*SE NÃO CONSEGUIR CHEGAR A ESCOLA ATÉ AS 16:00 HORAS.
FAVOR ENTRAR EM CONTATO COM UM DOS CONTATOS ABAIXO.

OBSERVAÇÕES:
*TOMAR MUITO CUIDADO COM OS ROMANEIOS, ATRAVÉS DELES QUE IREMOS RECEBER (NO CASO DE PERDA SERÁ DESCONTADO R$ 50,00)
*CASO NÃO RETORNE AS CAIXAS SERÁ DESCONTADO R$ 20,00 POR UNIDADE.
*TODOS OS VEÍCULOS DEVERÃO RETORNAR NO MESMO DIA PARA A DEVOLUÇÃO DAS CAIXAS E ROMANEIOS ATÉ AS 20:00 HORAS.
*SE OS ROMANEIOS NÃO RETORNAREM NO DIA HAVERÁ ATRASO DE PAGAMENTO TANTO PARA A COOPERATIVA QUANTO PARA O MOTORISTA.
*QUALQUER PROBLEMA PODE LIGAR A COBRAR, PARA QUE POSSAMOS RESOLVER AINDA NO LOCAL.
CENTRAL: (11) 4996-3311  CELULAR: (11) 97475-7456`

type Rota = {
  id: string
  codigo: string
  nome: string
  agregados: { nome: string } | null
}

type ManifestoRow = {
  id: string
  numero: number
  numero_base: number
  letra: string
  data_entrega: string
  rota: Rota
  pontos: number
}

type PontoManifesto = {
  mp_id: string
  pde_id: string
  sequencia: number
  codigo_prefeitura: string | null
  pde_nome: string
  endereco: string | null
  qtdes: Record<string, { inteira: number; fracionada: number }>
}

type PontoDisp = {
  id: string
  nome: string
  codigo_prefeitura: string | null
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function numDisplay(n: number, l: string) {
  return String(n).padStart(4, '0') + l
}

// ── Sortable row (edit mode) ─────────────────────────────────────────────────

function SortablePonto({
  item,
  index,
  isDuplicado,
  isSemPedido,
  onRemove,
}: {
  item: PontoManifesto
  index: number
  isDuplicado: boolean
  isSemPedido: boolean
  onRemove: (mp_id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.mp_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const bg = isDuplicado  ? 'bg-red-50'
           : isSemPedido  ? 'bg-amber-50'
           : 'bg-white hover:bg-gray-50/40'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group ${bg}`}
    >
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
      <span className="w-5 text-xs font-mono font-semibold text-gray-400 flex-shrink-0 text-right">
        {index + 1}
      </span>
      {item.codigo_prefeitura && (
        <span className="text-xs font-mono text-gray-400 flex-shrink-0 w-14">{item.codigo_prefeitura}</span>
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium block truncate ${isDuplicado ? 'text-red-700' : 'text-gray-900'}`}>
          {item.pde_nome}
          {isDuplicado  && <span className="ml-2 text-[10px] font-normal text-red-400">(duplicado)</span>}
          {isSemPedido  && <span className="ml-2 text-[10px] font-normal text-amber-500">sem pedido</span>}
        </span>
        {item.endereco && (
          <span className="text-xs text-gray-400 block truncate">{item.endereco}</span>
        )}
      </div>
      <button
        onClick={() => onRemove(item.mp_id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 flex-shrink-0"
        title="Remover ponto"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6"/>
          <path d="M14 11v6"/>
        </svg>
      </button>
    </div>
  )
}

// ── Componente Manifesto ─────────────────────────────────────────────────────

function Manifesto({ manifesto, onVoltar, onDuplicado }: {
  manifesto: ManifestoRow
  onVoltar: () => void
  onDuplicado: (nova: ManifestoRow) => void
}) {
  const { id, numero_base, letra, data_entrega, rota } = manifesto

  const [pontos,       setPontos]       = useState<PontoManifesto[]>([])
  const [produtos,     setProdutos]     = useState<string[]>([])
  const [totais,       setTotais]       = useState<Record<string, { inteira: number; fracionada: number }>>({})
  const [dataReceber,  setReceber]      = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [editando,     setEditando]     = useState(false)
  const [dirty,        setDirty]        = useState(false)
  const [ordemSalvando,setOrdemSalvando]= useState(false)
  const [pontosDisp,   setPontosDisp]   = useState<PontoDisp[]>([])
  const [duplicados,   setDuplicados]   = useState<Set<string>>(new Set())
  const [busca,        setBusca]        = useState('')
  const [showSugestoes,setShowSugestoes]= useState(false)
  const [adicionando,  setAdicionando]  = useState(false)
  const [duplicando,   setDuplicando]   = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const carregar = useCallback(async () => {
    const sb = getSupabase()
    setLoading(true)

    const [{ data: mpData }, { data: ciclosData }] = await Promise.all([
      sb.from('manifesto_pontos')
        .select('id, pde_id, sequencia, pontos_de_entrega(nome, codigo_prefeitura, endereco)')
        .eq('manifesto_id', id)
        .order('sequencia'),
      sb.from('ciclos').select('id, data_receber').eq('data_entrega', data_entrega),
    ])

    const cicloIds = (ciclosData || []).map((c: any) => c.id as string)
    const pdeIds   = (mpData     || []).map((p: any) => p.pde_id as string)
    setReceber((ciclosData || []).find((c: any) => c.data_receber)?.data_receber ?? null)

    let ceData: any[] = []
    if (cicloIds.length && pdeIds.length) {
      const { data } = await sb
        .from('ciclo_entregas')
        .select('ponto_de_entrega_id, qtde_inteira, qtde_fracionada, produtos(nome)')
        .in('ciclo_id', cicloIds)
        .in('ponto_de_entrega_id', pdeIds)
      ceData = data || []
    }

    const qtdeMap: Record<string, Record<string, { inteira: number; fracionada: number }>> = {}
    const prodSet = new Set<string>()
    const seen    = new Set<string>()
    for (const e of ceData) {
      const pdeId = e.ponto_de_entrega_id as string
      const prod  = (e.produtos as any)?.nome as string
      if (!prod) continue
      const key = `${pdeId}:${prod}`
      if (seen.has(key)) continue
      seen.add(key); prodSet.add(prod)
      if (!qtdeMap[pdeId]) qtdeMap[pdeId] = {}
      qtdeMap[pdeId][prod] = { inteira: e.qtde_inteira ?? 0, fracionada: e.qtde_fracionada ?? 0 }
    }

    const prods = Array.from(prodSet).sort()
    setProdutos(prods)

    const newPontos: PontoManifesto[] = (mpData || []).map((p: any) => ({
      mp_id:             p.id as string,
      pde_id:            p.pde_id as string,
      sequencia:         p.sequencia as number,
      codigo_prefeitura: (p.pontos_de_entrega as any)?.codigo_prefeitura ?? null,
      pde_nome:          (p.pontos_de_entrega as any)?.nome ?? '?',
      endereco:          (p.pontos_de_entrega as any)?.endereco ?? null,
      qtdes:             qtdeMap[p.pde_id] ?? {},
    }))
    setPontos(newPontos)

    const tots: Record<string, { inteira: number; fracionada: number }> = {}
    for (const prod of prods) {
      tots[prod] = { inteira: 0, fracionada: 0 }
      for (const p of newPontos) {
        tots[prod].inteira    += p.qtdes[prod]?.inteira    ?? 0
        tots[prod].fracionada += p.qtdes[prod]?.fracionada ?? 0
      }
    }
    setTotais(tots)

    // Verificar duplicatas em QUALQUER manifesto da mesma data de entrega
    if (newPontos.length) {
      const { data: outrosManifestos } = await sb
        .from('ciclo_manifestos').select('id').eq('data_entrega', data_entrega)
      const outrosIds = (outrosManifestos || []).map((m: any) => m.id as string).filter(mid => mid !== id)
      if (outrosIds.length) {
        const pdes = newPontos.map(p => p.pde_id)
        const { data: outrosPts } = await sb
          .from('manifesto_pontos').select('pde_id')
          .in('manifesto_id', outrosIds).in('pde_id', pdes)
        setDuplicados(new Set((outrosPts || []).map((p: any) => p.pde_id as string)))
      } else {
        setDuplicados(new Set())
      }
    }

    setLoading(false)
  }, [id, data_entrega, rota.id])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const el = document.createElement('style')
    el.setAttribute('data-manifesto-print', '')
    el.textContent = `@media print { @page { size: A4 ${produtos.length >= 2 ? 'landscape' : 'portrait'}; } }`
    document.head.appendChild(el)
    return () => el.remove()
  }, [produtos.length])

  async function atualizarDuplicados(currentPdeIds: string[]) {
    if (!currentPdeIds.length) { setDuplicados(new Set()); return }
    const sb = getSupabase()
    const { data: outrosManifestos } = await sb
      .from('ciclo_manifestos').select('id').eq('data_entrega', data_entrega)
    const outrosIds = (outrosManifestos || []).map((m: any) => m.id as string).filter(mid => mid !== id)
    if (!outrosIds.length) { setDuplicados(new Set()); return }
    const { data: outrosPts } = await sb
      .from('manifesto_pontos').select('pde_id')
      .in('manifesto_id', outrosIds).in('pde_id', currentPdeIds)
    setDuplicados(new Set((outrosPts || []).map((p: any) => p.pde_id as string)))
  }

  async function carregarDisp() {
    const sb = getSupabase()
    const emAtual = new Set(pontos.map(p => p.pde_id))

    // Detectar duplicatas: quais pontos deste manifesto também estão em outras variantes
    const { data: varianteIds } = await sb
      .from('ciclo_manifestos').select('id').eq('rota_id', rota.id)
    const outrosIds = (varianteIds || []).map((m: any) => m.id as string).filter(mid => mid !== id)
    if (outrosIds.length && emAtual.size) {
      const { data: outrosPts } = await sb
        .from('manifesto_pontos').select('pde_id')
        .in('manifesto_id', outrosIds).in('pde_id', Array.from(emAtual))
      setDuplicados(new Set((outrosPts || []).map((p: any) => p.pde_id as string)))
    } else {
      setDuplicados(new Set())
    }

    // Pool = TODOS os pontos_de_entrega cadastrados (busca global)
    // sugestoes exclui o que já está no manifesto em tempo de render
    const { data: todosPDE } = await sb
      .from('pontos_de_entrega')
      .select('id, nome, codigo_prefeitura')
      .order('nome')
    setPontosDisp(
      (todosPDE || []).map((p: any) => ({
        id:                p.id as string,
        nome:              (p.nome as string) ?? '?',
        codigo_prefeitura: (p.codigo_prefeitura as string | null) ?? null,
      }))
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPontos(prev => {
      const oldIndex = prev.findIndex(p => p.mp_id === active.id)
      const newIndex = prev.findIndex(p => p.mp_id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
    setDirty(true)
  }

  async function salvarOrdem() {
    setOrdemSalvando(true)
    const sb = getSupabase()
    await Promise.all(
      pontos.map((p, i) =>
        sb.from('manifesto_pontos').update({ sequencia: i + 1 }).eq('id', p.mp_id)
      )
    )
    setPontos(prev => prev.map((p, i) => ({ ...p, sequencia: i + 1 })))
    setDirty(false)
    setOrdemSalvando(false)
  }

  async function fecharEdicao() {
    if (dirty) await salvarOrdem()
    setEditando(false)
    setDirty(false)
    carregar()
  }

  async function remover(mp_id: string) {
    const sb = getSupabase()
    await sb.from('manifesto_pontos').delete().eq('id', mp_id)
    const novo = pontos
      .filter(p => p.mp_id !== mp_id)
      .map((p, i) => ({ ...p, sequencia: i + 1 }))
    setPontos(novo)
    await Promise.all(novo.map(p =>
      sb.from('manifesto_pontos').update({ sequencia: p.sequencia }).eq('id', p.mp_id)
    ))
    setDirty(false)
    atualizarDuplicados(novo.map(p => p.pde_id))
  }

  async function adicionar(pde: PontoDisp) {
    if (adicionando) return
    setAdicionando(true)
    setBusca('')
    setShowSugestoes(false)
    const sb      = getSupabase()
    const proxSeq = pontos.length ? Math.max(...pontos.map(p => p.sequencia)) + 1 : 1
    const { data } = await sb
      .from('manifesto_pontos')
      .insert({ manifesto_id: id, pde_id: pde.id, sequencia: proxSeq })
      .select('id, pde_id, sequencia, pontos_de_entrega(nome, codigo_prefeitura, endereco)')
      .single()
    if (data) {
      const pdeInfo = (data as any).pontos_de_entrega
      const novoPonto = {
        mp_id:             data.id,
        pde_id:            data.pde_id,
        sequencia:         data.sequencia,
        codigo_prefeitura: pdeInfo?.codigo_prefeitura ?? null,
        pde_nome:          pdeInfo?.nome ?? '?',
        endereco:          pdeInfo?.endereco ?? null,
        qtdes:             {},
      }
      const novosPdeIds = [...pontos.map(p => p.pde_id), data.pde_id as string]
      setPontos(prev => [...prev, novoPonto])
      await atualizarDuplicados(novosPdeIds)
    }
    setAdicionando(false)
  }

  async function duplicar() {
    if (duplicando) return
    setDuplicando(true)
    const sb = getSupabase()
    const { data: ex } = await sb
      .from('ciclo_manifestos')
      .select('letra')
      .eq('data_entrega', data_entrega)
      .eq('rota_id', rota.id)
    const usadas       = new Set((ex || []).map((e: any) => e.letra as string))
    const proximaLetra = 'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !usadas.has(l)) ?? 'B'
    const { data: novo } = await sb
      .from('ciclo_manifestos')
      .insert({ data_entrega, rota_id: rota.id, letra: proximaLetra, numero_base })
      .select('id, numero, numero_base, letra')
      .single()
    if (novo && pontos.length > 0) {
      await sb.from('manifesto_pontos').insert(
        pontos.map(p => ({ manifesto_id: novo.id, pde_id: p.pde_id, sequencia: p.sequencia }))
      )
    }
    if (novo) {
      onDuplicado({
        id:           novo.id,
        numero:       novo.numero as number,
        numero_base:  novo.numero_base as number,
        letra:        novo.letra as string,
        data_entrega,
        rota,
        pontos:       pontos.length,
      })
    }
    setDuplicando(false)
  }

  const emAtualIds = new Set(pontos.map(p => p.pde_id))
  const sugestoes = busca.trim().length >= 1
    ? pontosDisp.filter(p => {
        if (emAtualIds.has(p.id)) return false
        const q = busca.toLowerCase()
        return p.nome.toLowerCase().includes(q) || (p.codigo_prefeitura || '').includes(q)
      }).slice(0, 8)
    : []

  const totalPacotes = Object.values(totais).reduce((s, t) => s + t.fracionada, 0)
  const totalCaixas  = Object.values(totais).reduce((s, t) => s + t.inteira, 0) + Math.floor(totalPacotes / 12 + 0.6)
  const sinal = totalCaixas === 0 ? null
    : totalCaixas < 36 ? { cor: '#FEE2E2', txt: '#991B1B', label: `${totalCaixas} cx — abaixo do ideal` }
    : totalCaixas < 60 ? { cor: '#FEF9C3', txt: '#854D0E', label: `${totalCaixas} cx — atenção` }
    : { cor: '#DCFCE7', txt: '#166534', label: `${totalCaixas} cx — ideal` }

  return (
    <div className="pt-4">
      {/* Barra de ações */}
      <div className="flex items-center justify-between mb-4 print:hidden gap-2 flex-wrap">
        <button onClick={onVoltar}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Voltar
        </button>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={duplicar} disabled={duplicando}
            className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {duplicando ? 'Duplicando…' : 'Duplicar manifesto'}
          </button>
          {editando && dirty && (
            <button onClick={salvarOrdem} disabled={ordemSalvando}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-amber-50 border-amber-300 text-amber-700 disabled:opacity-50 transition-colors">
              {ordemSalvando ? 'Salvando…' : 'Salvar ordem'}
            </button>
          )}
          <button
            onClick={() => { if (!editando) { setEditando(true); carregarDisp() } else fecharEdicao() }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${editando ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {editando ? '✓ Fechar edição' : 'Editar pontos'}
          </button>
          <button onClick={() => window.print()}
            className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
            style={{ background: PRIMARY }}>
            Imprimir
          </button>
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 print:rounded-none print:border-0 print:p-0 print:mb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-gray-900">{rota.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{rota.codigo}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sinal && (
              <span className="print:hidden text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: sinal.cor, color: sinal.txt }}>
                {sinal.label}
              </span>
            )}
            <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
              Manifesto Nº {numDisplay(numero_base, letra)}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-6 text-xs text-gray-600">
          <span><span className="font-medium">Entrega:</span> {fmtDate(data_entrega)}</span>
          {dataReceber && <span><span className="font-medium">Recebimento:</span> {fmtDate(dataReceber)}</span>}
          {rota.agregados && <span><span className="font-medium">Motorista:</span> {rota.agregados.nome}</span>}
          <span><span className="font-medium">Paradas:</span> {pontos.length}</span>
        </div>
        <div className="hidden print:flex mt-3 pt-3 border-t border-gray-200 items-center gap-4">
          <QRCode
            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/mobile/estoque?manifesto=${numero_base}${letra}`}
            size={96}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-gray-400 font-mono">#{numDisplay(numero_base, letra)}</span>
            {totalCaixas > 0 && (
              <span className="text-xs font-bold text-gray-800">{totalCaixas} caixas</span>
            )}
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando manifesto…</p> : (
        <>
          {/* ── Modo edição: lista sortable ─────────────────────────────── */}
          {editando && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print:hidden">
              {pontos.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-400">Nenhuma parada. Use o seletor abaixo para adicionar pontos.</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={pontos.map(p => p.mp_id)} strategy={verticalListSortingStrategy}>
                    {pontos.map((p, i) => (
                      <SortablePonto
                        key={p.mp_id}
                        item={p}
                        index={i}
                        isDuplicado={duplicados.has(p.pde_id)}
                        isSemPedido={!Object.values(p.qtdes).some(q => q.inteira > 0 || q.fracionada > 0)}
                        onRemove={remover}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}

              {/* Adicionar ponto */}
              <div className="border-t border-gray-100 p-4 relative">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    value={busca}
                    onChange={e => { setBusca(e.target.value); setShowSugestoes(true) }}
                    onFocus={() => setShowSugestoes(true)}
                    onBlur={() => setTimeout(() => setShowSugestoes(false), 150)}
                    placeholder="Buscar escola por nome ou código…"
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#5C0F0F]"
                  />
                </div>
                {showSugestoes && sugestoes.length > 0 && (
                  <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                    {sugestoes.map(p => (
                      <button key={p.id} onMouseDown={() => adicionar(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <span className="text-sm font-medium text-gray-900 block">{p.nome}</span>
                        {p.codigo_prefeitura && <span className="text-xs text-gray-400">Cód. {p.codigo_prefeitura}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {showSugestoes && busca.trim().length >= 1 && sugestoes.length === 0 && (
                  <div className="absolute bottom-full left-4 right-4 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20">
                    <p className="text-xs text-gray-400 text-center">Nenhum ponto encontrado</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Modo visualização: tabela completa com produtos ──────────── */}
          {!editando && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto print:rounded-none print:border-0 print:overflow-visible">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-500 print:text-black w-8 border-b border-gray-100 align-bottom">Seq</th>
                    <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-500 w-20 border-b border-gray-100 align-bottom">Código</th>
                    <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-500 border-b border-gray-100 align-bottom">Unidade</th>
                    <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-500 border-b border-gray-100 align-bottom">Endereço</th>
                    {produtos.map(p => (
                      <th key={p} colSpan={2} className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 border-l border-gray-200">{p}</th>
                    ))}
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {produtos.map(p => (
                      <React.Fragment key={p}>
                        <th className="text-center px-2 py-1 font-medium text-gray-400 print:text-black w-10 border-l border-gray-200">Cx</th>
                        <th className="text-center px-2 py-1 font-medium text-gray-400 print:text-black w-10">Pc</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pontos.map((row, i) => {
                    const dup       = duplicados.has(row.pde_id)
                    const semPedido = !Object.values(row.qtdes).some(q => q.inteira > 0 || q.fracionada > 0)
                    const rowBg     = dup        ? 'bg-red-50'
                                    : semPedido  ? 'bg-amber-50 print:hidden'
                                    : i % 2 === 0 ? '' : 'bg-gray-50/40'
                    return (
                    <tr key={row.mp_id} className={`border-b border-gray-50 last:border-0 ${rowBg}`}>
                      <td className="px-3 py-2 font-mono text-gray-400 print:text-black text-center">{row.sequencia}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.codigo_prefeitura || '—'}</td>
                      <td className={`px-3 py-2 font-medium max-w-[200px] truncate print:max-w-none print:whitespace-normal ${dup ? 'text-red-700' : 'text-gray-900'}`}>
                        {row.pde_nome}
                        {dup       && <span className="ml-1.5 text-[10px] font-normal text-red-400">(duplicado)</span>}
                        {semPedido && <span className="ml-1.5 text-[10px] font-normal text-amber-400">sem pedido</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate print:max-w-none print:whitespace-normal">{row.endereco || '—'}</td>
                      {produtos.map(p => {
                        const q = row.qtdes[p]
                        return (
                          <React.Fragment key={p}>
                            <td className="px-2 py-2 text-center font-mono text-gray-800 border-l border-gray-100">
                              {q?.inteira ? q.inteira : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-2 text-center font-mono text-gray-800">
                              {q?.fracionada ? q.fracionada : <span className="text-gray-300">—</span>}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  )
                  })}
                  {pontos.length === 0 && (
                    <tr><td colSpan={4 + produtos.length * 2} className="px-3 py-8 text-center text-gray-400">
                      Nenhuma parada neste manifesto.
                    </td></tr>
                  )}
                </tbody>
                {pontos.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-xs text-gray-600">Total</td>
                      {produtos.map(p => (
                        <React.Fragment key={p}>
                          <td className="px-2 py-2 text-center text-xs font-semibold text-gray-800 border-l border-gray-100">
                            {totais[p]?.inteira || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-xs font-semibold text-gray-800">
                            {totais[p]?.fracionada || <span className="text-gray-300">—</span>}
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Total de caixas (print only) */}
          {totalCaixas > 0 && (
            <div className="hidden print:block mt-3 text-xs text-gray-700">
              {produtos.map(p => (
                <span key={p} className="mr-4">
                  <span className="font-medium">{p}:</span>{' '}
                  {totais[p]?.inteira ?? 0} cx e {totais[p]?.fracionada ?? 0} pac ({Math.floor((totais[p]?.fracionada ?? 0) / 12 + 0.6)} cx)
                </span>
              ))}
              <span className="font-bold ml-2">Total {totalCaixas} caixas</span>
            </div>
          )}

          {/* Aviso ao motorista (print only) */}
          <div className="hidden print:block mt-4 border border-gray-300 rounded p-3 text-[10px] text-gray-700 leading-relaxed whitespace-pre-line">
            {AVISO_MOTORISTA}
          </div>
        </>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function ManifestosPage() {
  const [manifestos, setManifestos] = useState<ManifestoRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [sel,        setSel]        = useState<ManifestoRow | null>(null)

  async function carregar() {
    const sb = getSupabase()
    const { data: mData } = await sb
      .from('ciclo_manifestos')
      .select('id, numero, numero_base, letra, data_entrega, rota_id, rotas(id, codigo, nome, agregados(nome))')
      .order('numero_base', { ascending: false })
      .order('letra',       { ascending: true  })

    if (!mData?.length) { setLoading(false); return }

    const ids = mData.map((m: any) => m.id as string)
    const { data: mpData } = await sb
      .from('manifesto_pontos')
      .select('manifesto_id')
      .in('manifesto_id', ids)

    const cnt: Record<string, number> = {}
    for (const p of mpData || []) cnt[p.manifesto_id] = (cnt[p.manifesto_id] || 0) + 1

    setManifestos((mData as any[]).map(m => ({
      id:           m.id          as string,
      numero:       m.numero      as number,
      numero_base:  m.numero_base as number,
      letra:        m.letra       as string,
      data_entrega: m.data_entrega as string,
      rota: {
        ...(m.rotas as any),
        agregados: (m.rotas as any)?.agregados ?? null,
      } as Rota,
      pontos: cnt[m.id] || 0,
    })))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  if (sel) return (
    <Manifesto
      manifesto={sel}
      onVoltar={() => setSel(null)}
      onDuplicado={nova => {
        setManifestos(prev => {
          const idx  = prev.findIndex(m => m.id === sel.id)
          const copy = [...prev]
          copy.splice(idx + 1, 0, nova)
          return copy
        })
        setSel(nova)
      }}
    />
  )

  return (
    <div className="pt-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Manifestos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Clique para abrir, editar e imprimir</p>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-16">Nº</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Rota</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Motorista</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entrega</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Paradas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {manifestos.map(m => (
                <tr key={m.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/30 cursor-pointer"
                  onClick={() => setSel(m)}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">
                    {numDisplay(m.numero_base, m.letra)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-500 mr-2">{m.rota.codigo}</span>
                    <span className="text-gray-800">{m.rota.nome}</span>
                    {m.letra && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        cópia {m.letra}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{m.rota.agregados?.nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(m.data_entrega)}</td>
                  <td className="px-4 py-3 text-gray-500">{m.pontos}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium" style={{ color: PRIMARY }}>Abrir →</span>
                  </td>
                </tr>
              ))}
              {manifestos.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum manifesto encontrado.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
