'use client'

import { useEffect, useState, useCallback } from 'react'
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
  onRemove,
}: {
  item: PontoManifesto
  index: number
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50/40 group"
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
        <span className="text-sm font-medium text-gray-900 block truncate">{item.pde_nome}</span>
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
  const [pdeAdd,       setPdeAdd]       = useState('')
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
        .eq('rota_id', rota.id)
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
    setLoading(false)
  }, [id, data_entrega, rota.id])

  useEffect(() => { carregar() }, [carregar])

  async function carregarDisp() {
    const sb = getSupabase()
    const emManifesto = new Set(pontos.map(p => p.pde_id))
    const { data } = await sb
      .from('rota_pontos')
      .select('ponto_de_entrega_id, pontos_de_entrega(id, nome, codigo_prefeitura)')
      .eq('rota_id', rota.id)
      .order('sequencia' as any)
    setPontosDisp(
      (data || [])
        .filter((r: any) => !emManifesto.has(r.ponto_de_entrega_id))
        .map((r: any) => ({
          id:                r.ponto_de_entrega_id as string,
          nome:              (r.pontos_de_entrega as any)?.nome ?? '?',
          codigo_prefeitura: (r.pontos_de_entrega as any)?.codigo_prefeitura ?? null,
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
  }

  async function remover(mp_id: string) {
    const sb    = getSupabase()
    const ponto = pontos.find(p => p.mp_id === mp_id)
    await sb.from('manifesto_pontos').delete().eq('id', mp_id)
    const novo = pontos
      .filter(p => p.mp_id !== mp_id)
      .map((p, i) => ({ ...p, sequencia: i + 1 }))
    setPontos(novo)
    if (ponto) {
      setPontosDisp(prev => [
        ...prev,
        { id: ponto.pde_id, nome: ponto.pde_nome, codigo_prefeitura: ponto.codigo_prefeitura },
      ])
    }
    await Promise.all(novo.map(p =>
      sb.from('manifesto_pontos').update({ sequencia: p.sequencia }).eq('id', p.mp_id)
    ))
    setDirty(false)
  }

  async function adicionar() {
    if (!pdeAdd || adicionando) return
    setAdicionando(true)
    const sb      = getSupabase()
    const proxSeq = pontos.length ? Math.max(...pontos.map(p => p.sequencia)) + 1 : 1
    const { data } = await sb
      .from('manifesto_pontos')
      .insert({ manifesto_id: id, pde_id: pdeAdd, sequencia: proxSeq })
      .select('id, pde_id, sequencia, pontos_de_entrega(nome, codigo_prefeitura, endereco)')
      .single()
    if (data) {
      const pde = (data as any).pontos_de_entrega
      setPontos(prev => [...prev, {
        mp_id:             data.id,
        pde_id:            data.pde_id,
        sequencia:         data.sequencia,
        codigo_prefeitura: pde?.codigo_prefeitura ?? null,
        pde_nome:          pde?.nome ?? '?',
        endereco:          pde?.endereco ?? null,
        qtdes:             {},
      }])
      setPontosDisp(prev => prev.filter(p => p.id !== pdeAdd))
      setPdeAdd('')
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

  const totalPacotes = Object.values(totais).reduce((s, t) => s + t.fracionada, 0)
  const totalCaixas  = Object.values(totais).reduce((s, t) => s + t.inteira, 0) + Math.ceil(totalPacotes / 12)
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
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
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
        <div className="hidden print:block mt-3 pt-3 border-t border-gray-200 text-xs text-gray-700">
          <span className="font-medium">Cooperativa:</span>{' '}
          <span className="inline-block w-48 border-b border-gray-400 ml-1">&nbsp;</span>
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
                      <SortablePonto key={p.mp_id} item={p} index={i} onRemove={remover} />
                    ))}
                  </SortableContext>
                </DndContext>
              )}

              {/* Adicionar ponto */}
              <div className="border-t border-gray-100 p-4">
                <div className="flex gap-2">
                  <select value={pdeAdd} onChange={e => setPdeAdd(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C0F0F] bg-white">
                    <option value="">Selecione um ponto para adicionar…</option>
                    {pontosDisp.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codigo_prefeitura ? `${p.codigo_prefeitura} — ` : ''}{p.nome}
                      </option>
                    ))}
                  </select>
                  <button onClick={adicionar} disabled={!pdeAdd || adicionando}
                    className="text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 hover:opacity-90"
                    style={{ background: PRIMARY }}>
                    {adicionando ? '…' : '+ Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modo visualização: tabela completa com produtos ──────────── */}
          {!editando && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto print:rounded-none print:border-0 print:overflow-visible">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-500 w-8">Seq</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500 w-20">Código</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Unidade</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Endereço</th>
                    {produtos.map(p => (
                      <th key={p} className="text-center px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pontos.map((row, i) => (
                    <tr key={row.mp_id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-3 py-2 font-mono text-gray-400 text-center">{row.sequencia}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.codigo_prefeitura || '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate print:max-w-none print:whitespace-normal">{row.pde_nome}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate print:max-w-none print:whitespace-normal">{row.endereco || '—'}</td>
                      {produtos.map(p => {
                        const q = row.qtdes[p]
                        if (!q || (q.inteira === 0 && q.fracionada === 0)) {
                          return <td key={p} className="px-3 py-2 text-center text-gray-300">—</td>
                        }
                        return (
                          <td key={p} className="px-3 py-2 text-center font-medium text-gray-800">
                            {q.inteira > 0 && <span>{q.inteira}cx</span>}
                            {q.inteira > 0 && q.fracionada > 0 && <span className="mx-0.5 text-gray-300">+</span>}
                            {q.fracionada > 0 && <span>{q.fracionada}pc</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {pontos.length === 0 && (
                    <tr><td colSpan={4 + produtos.length} className="px-3 py-8 text-center text-gray-400">
                      Nenhuma parada neste manifesto.
                    </td></tr>
                  )}
                </tbody>
                {pontos.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-xs text-gray-600">Total</td>
                      {produtos.map(p => (
                        <td key={p} className="px-3 py-2 text-center text-xs text-gray-800">
                          {totais[p].inteira > 0 && <span>{totais[p].inteira}cx</span>}
                          {totais[p].inteira > 0 && totais[p].fracionada > 0 && <span className="mx-0.5 text-gray-300">+</span>}
                          {totais[p].fracionada > 0 && <span>{totais[p].fracionada}pc</span>}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Aviso ao motorista (print only) */}
          <div className="hidden print:block mt-6 border border-gray-300 rounded p-3 text-[10px] text-gray-700 leading-relaxed whitespace-pre-line">
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
    <div>
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
