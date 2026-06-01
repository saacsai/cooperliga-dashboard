'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

const PRIMARY = '#5C0F0F'

type Ciclo = {
  id: string
  numero_pedido: string
  data_entrega: string
  data_receber: string | null
  contratos: { orgao: string; codigo: string | null } | null
}

type RotaCiclo = {
  id: string
  codigo: string
  nome: string
  agregados: { nome: string } | null
  pontos: number
}

type EntregaRow = {
  pde_id: string
  sequencia: number | null
  codigo_prefeitura: string | null
  pde_nome: string
  endereco: string | null
  qtdes: Record<string, { inteira: number; fracionada: number }>
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── Manifesto imprimível ────────────────────────────────────────────────────

function Manifesto({
  ciclo,
  rota,
  onVoltar,
}: {
  ciclo: Ciclo
  rota: RotaCiclo
  onVoltar: () => void
}) {
  const [rows, setRows]       = useState<EntregaRow[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const sb = getSupabase()

      const [{ data: rp }, { data: ce }] = await Promise.all([
        sb.from('rota_pontos')
          .select('ponto_de_entrega_id, sequencia')
          .eq('rota_id', rota.id)
          .order('sequencia'),
        sb.from('ciclo_entregas')
          .select('ponto_de_entrega_id, qtde_inteira, qtde_fracionada, produtos(nome), pontos_de_entrega(nome, codigo_prefeitura, endereco)')
          .eq('ciclo_id', ciclo.id),
      ])

      const seqMap: Record<string, number> = {}
      for (const r of rp || []) seqMap[r.ponto_de_entrega_id] = r.sequencia

      const pdeMap: Record<string, EntregaRow> = {}
      const prodSet = new Set<string>()

      for (const e of ce || []) {
        const pdeId  = e.ponto_de_entrega_id
        const prod   = (e as any).produtos?.nome as string
        const pde    = (e as any).pontos_de_entrega
        if (!prod || !pde) continue
        prodSet.add(prod)
        if (!pdeMap[pdeId]) {
          pdeMap[pdeId] = {
            pde_id:           pdeId,
            sequencia:        seqMap[pdeId] ?? null,
            codigo_prefeitura: pde.codigo_prefeitura,
            pde_nome:         pde.nome,
            endereco:         pde.endereco,
            qtdes:            {},
          }
        }
        pdeMap[pdeId].qtdes[prod] = {
          inteira:    e.qtde_inteira ?? 0,
          fracionada: e.qtde_fracionada ?? 0,
        }
      }

      const sortedProdos = Array.from(prodSet).sort()
      const sortedRows = Object.values(pdeMap).sort((a, b) => {
        if (a.sequencia == null && b.sequencia == null) return 0
        if (a.sequencia == null) return 1
        if (b.sequencia == null) return -1
        return a.sequencia - b.sequencia
      })

      setProdutos(sortedProdos)
      setRows(sortedRows)
      setLoading(false)
    }
    carregar()
  }, [ciclo.id, rota.id])

  const totais: Record<string, { inteira: number; fracionada: number }> = {}
  for (const prod of produtos) {
    totais[prod] = { inteira: 0, fracionada: 0 }
    for (const row of rows) {
      totais[prod].inteira    += row.qtdes[prod]?.inteira    ?? 0
      totais[prod].fracionada += row.qtdes[prod]?.fracionada ?? 0
    }
  }

  return (
    <div>
      {/* Ações */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={onVoltar}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Voltar
        </button>
        <button onClick={() => window.print()}
          className="text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          style={{ background: PRIMARY }}>
          Imprimir
        </button>
      </div>

      {/* Cabeçalho do manifesto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 print:rounded-none print:border-0 print:p-0 print:mb-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{rota.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{ciclo.contratos?.orgao || '—'}</p>
          </div>
          <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
            Pedido #{ciclo.numero_pedido}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-6 text-xs text-gray-600">
          <span><span className="font-medium">Entrega:</span> {fmtDate(ciclo.data_entrega)}</span>
          {ciclo.data_receber && <span><span className="font-medium">Recebimento:</span> {fmtDate(ciclo.data_receber)}</span>}
          {rota.agregados && <span><span className="font-medium">Motorista:</span> {rota.agregados.nome}</span>}
          <span><span className="font-medium">Paradas:</span> {rows.length}</span>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando manifesto…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto print:rounded-none print:border-0">
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
              {rows.map((row, i) => (
                <tr key={row.pde_id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  <td className="px-3 py-2 font-mono text-gray-400 text-center">{row.sequencia ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{row.codigo_prefeitura || '—'}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">{row.pde_nome}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{row.endereco || '—'}</td>
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
              {rows.length === 0 && (
                <tr><td colSpan={4 + produtos.length} className="px-3 py-8 text-center text-gray-400">
                  Nenhuma entrega encontrada para esta rota neste ciclo.
                </td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
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
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

export default function ManifestosPage() {
  const [ciclos,     setCiclos]     = useState<Ciclo[]>([])
  const [loading,    setLoading]    = useState(true)
  const [cicloSel,   setCicloSel]   = useState<Ciclo | null>(null)
  const [rotas,      setRotas]      = useState<RotaCiclo[]>([])
  const [loadRotas,  setLoadRotas]  = useState(false)
  const [rotaSel,    setRotaSel]    = useState<RotaCiclo | null>(null)

  useEffect(() => {
    getSupabase()
      .from('ciclos')
      .select('id, numero_pedido, data_entrega, data_receber, contratos(orgao, codigo)')
      .order('data_entrega', { ascending: false })
      .then(({ data }) => { setCiclos((data || []) as unknown as Ciclo[]); setLoading(false) })
  }, [])

  async function selecionarCiclo(ciclo: Ciclo) {
    setCicloSel(ciclo)
    setRotaSel(null)
    setLoadRotas(true)

    const { data: ce } = await getSupabase()
      .from('ciclo_entregas')
      .select('rota_id')
      .eq('ciclo_id', ciclo.id)
      .not('rota_id', 'is', null)

    const rotaIds = Array.from(new Set((ce || []).map((r: any) => r.rota_id as string)))

    if (rotaIds.length === 0) { setRotas([]); setLoadRotas(false); return }

    const { data: r } = await getSupabase()
      .from('rotas')
      .select('id, codigo, nome, agregados(nome)')
      .in('id', rotaIds)
      .order('codigo')

    const { data: rp } = await getSupabase()
      .from('rota_pontos')
      .select('rota_id')
      .in('rota_id', rotaIds)

    const contagemPontos: Record<string, number> = {}
    for (const p of rp || []) contagemPontos[p.rota_id] = (contagemPontos[p.rota_id] || 0) + 1

    setRotas((r || []).map((rota: any) => ({
      id:       rota.id,
      codigo:   rota.codigo,
      nome:     rota.nome,
      agregados: rota.agregados,
      pontos:   contagemPontos[rota.id] || 0,
    })))
    setLoadRotas(false)
  }

  // ── Manifesto view ──────────────────────────────────────────────────────
  if (cicloSel && rotaSel) {
    return (
      <Manifesto
        ciclo={cicloSel}
        rota={rotaSel}
        onVoltar={() => setRotaSel(null)}
      />
    )
  }

  // ── Rotas do ciclo ──────────────────────────────────────────────────────
  if (cicloSel) {
    return (
      <div>
        <button onClick={() => { setCicloSel(null); setRotas([]) }}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-4">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Todos os ciclos
        </button>

        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pedido #{cicloSel.numero_pedido}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {cicloSel.contratos?.orgao || 'Sem contrato'} · Entrega {fmtDate(cicloSel.data_entrega)}
              {cicloSel.data_receber && ` · Recebimento ${fmtDate(cicloSel.data_receber)}`}
            </p>
          </div>
        </div>

        {loadRotas ? <p className="text-sm text-gray-400">Carregando rotas…</p> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Rota</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Motorista</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Paradas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rotas.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-gray-800 text-xs">{r.codigo}</span>
                      <span className="ml-2 text-gray-700">{r.nome}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.agregados?.nome || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.pontos}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setRotaSel(r)}
                        className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>
                        Ver manifesto
                      </button>
                    </td>
                  </tr>
                ))}
                {rotas.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhuma rota encontrada para este ciclo.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Lista de ciclos ─────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Manifestos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ciclos de entrega — clique para ver as rotas e gerar manifesto</p>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contrato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Data entrega</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Data recebimento</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ciclos.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => selecionarCiclo(c)}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">#{c.numero_pedido}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.contratos ? (
                      <span>
                        {c.contratos.codigo && <span className="font-mono text-xs font-semibold mr-1.5">{c.contratos.codigo}</span>}
                        {c.contratos.orgao}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(c.data_entrega)}</td>
                  <td className="px-4 py-3 text-gray-500">{c.data_receber ? fmtDate(c.data_receber) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Ver rotas →</span>
                  </td>
                </tr>
              ))}
              {ciclos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum ciclo encontrado. Faça um upload na aba Guias de Remessa para gerar o primeiro ciclo.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
