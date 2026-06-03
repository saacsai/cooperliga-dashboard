'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

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

type Ciclo = {
  id: string
  numero: number | null
  numero_pedido: string
  data_entrega: string
  data_receber: string | null
  contrato_id: string | null
  contratos: { orgao: string; codigo: string | null } | null
}

type Rota = {
  id: string
  codigo: string
  nome: string
  agregados: { nome: string } | null
  pontos: number
}

type ManifestoRow = {
  numero: number
  ciclo: Ciclo
  rota: Rota
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

function padNum(n: number) {
  return String(n).padStart(4, '0')
}

// ── Manifesto imprimível ────────────────────────────────────────────────────

function Manifesto({
  numero,
  ciclo,
  rota,
  onVoltar,
}: {
  numero: number
  ciclo: Ciclo
  rota: Rota
  onVoltar: () => void
}) {
  const [rows, setRows]         = useState<EntregaRow[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)

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
          .eq('ciclo_id', ciclo.id)
          .eq('rota_id', rota.id),
      ])

      const seqMap: Record<string, number> = {}
      for (const r of rp || []) seqMap[r.ponto_de_entrega_id] = r.sequencia

      const pdeMap: Record<string, EntregaRow> = {}
      const prodSet = new Set<string>()

      for (const e of ce || []) {
        const pdeId = e.ponto_de_entrega_id
        const prod  = (e as any).produtos?.nome as string
        const pde   = (e as any).pontos_de_entrega
        if (!prod || !pde) continue
        prodSet.add(prod)
        if (!pdeMap[pdeId]) {
          pdeMap[pdeId] = {
            pde_id:            pdeId,
            sequencia:         seqMap[pdeId] ?? null,
            codigo_prefeitura: pde.codigo_prefeitura,
            pde_nome:          pde.nome,
            endereco:          pde.endereco,
            qtdes:             {},
          }
        }
        pdeMap[pdeId].qtdes[prod] = {
          inteira:    e.qtde_inteira ?? 0,
          fracionada: e.qtde_fracionada ?? 0,
        }
      }

      setProdutos(Array.from(prodSet).sort())
      setRows(Object.values(pdeMap).sort((a, b) => {
        if (a.sequencia == null && b.sequencia == null) return 0
        if (a.sequencia == null) return 1
        if (b.sequencia == null) return -1
        return a.sequencia - b.sequencia
      }))
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

  const totalPacotes = Object.values(totais).reduce((sum, t) => sum + t.fracionada, 0)
  const totalCaixas  = Object.values(totais).reduce((sum, t) => sum + t.inteira, 0) + Math.ceil(totalPacotes / 12)

  return (
    <div>
      {/* Ações — ocultas na impressão */}
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

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 print:rounded-none print:border-0 print:p-0 print:mb-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{rota.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{ciclo.contratos?.orgao || '—'}</p>
          </div>
          <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
            Manifesto Nº {padNum(numero)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-6 text-xs text-gray-600">
          <span><span className="font-medium">Entrega:</span> {fmtDate(ciclo.data_entrega)}</span>
          {ciclo.data_receber && <span><span className="font-medium">Recebimento:</span> {fmtDate(ciclo.data_receber)}</span>}
          {rota.agregados && <span><span className="font-medium">Motorista:</span> {rota.agregados.nome}</span>}
          <span><span className="font-medium">Paradas:</span> {rows.length}</span>
          {!loading && totalCaixas > 0 && (
            <span className="font-semibold text-gray-800">
              <span className="font-medium">Caixas plásticas:</span> {totalCaixas} (devolver ao final)
            </span>
          )}
        </div>
        {/* Campo cooperativa — apenas impressão */}
        <div className="hidden print:block mt-3 pt-3 border-t border-gray-200 text-xs text-gray-700">
          <span className="font-medium">Cooperativa:</span>{' '}
          <span className="inline-block w-48 border-b border-gray-400 ml-1">&nbsp;</span>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando manifesto…</p> : (
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
              {rows.map((row, i) => (
                <tr key={row.pde_id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  <td className="px-3 py-2 font-mono text-gray-400 text-center">{row.sequencia ?? '—'}</td>
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

      {/* Aviso ao motorista — apenas impressão */}
      <div className="hidden print:block mt-6 border border-gray-300 rounded p-3 text-[10px] text-gray-700 leading-relaxed whitespace-pre-line">
        {AVISO_MOTORISTA}
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

export default function ManifestosPage() {
  const [manifests, setManifests] = useState<ManifestoRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sel,       setSel]       = useState<ManifestoRow | null>(null)

  useEffect(() => {
    async function carregar() {
      const sb = getSupabase()

      const { data: mData } = await sb
        .from('ciclo_manifestos')
        .select('numero, ciclo_id, rota_id, ciclos(id, numero, numero_pedido, data_entrega, data_receber, contrato_id, contratos(orgao, codigo)), rotas(id, codigo, nome, agregados(nome))')
        .order('numero', { ascending: false })

      if (!mData?.length) { setLoading(false); return }

      const rotaIds = Array.from(new Set(mData.map((m: any) => m.rota_id as string)))
      const { data: rpData } = await sb
        .from('rota_pontos')
        .select('rota_id')
        .in('rota_id', rotaIds)

      const contagemPontos: Record<string, number> = {}
      for (const p of rpData || []) contagemPontos[p.rota_id] = (contagemPontos[p.rota_id] || 0) + 1

      const rows: ManifestoRow[] = (mData as any[]).map(m => ({
        numero: m.numero as number,
        ciclo:  m.ciclos as Ciclo,
        rota:   { ...(m.rotas as any), pontos: contagemPontos[m.rota_id] || 0 } as Rota,
      }))

      setManifests(rows)
      setLoading(false)
    }
    carregar()
  }, [])

  // ── Manifesto aberto ────────────────────────────────────────────────────
  if (sel) {
    return (
      <Manifesto
        numero={sel.numero}
        ciclo={sel.ciclo}
        rota={sel.rota}
        onVoltar={() => setSel(null)}
      />
    )
  }

  // ── Lista de manifestos ─────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Manifestos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Um manifesto por rota — clique para abrir e imprimir</p>
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
              {manifests.map(m => (
                <tr key={`${m.ciclo.id}:${m.rota.id}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/30 cursor-pointer"
                  onClick={() => setSel(m)}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{padNum(m.numero)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-500 mr-2">{m.rota.codigo}</span>
                    <span className="text-gray-800">{m.rota.nome}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{m.rota.agregados?.nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(m.ciclo.data_entrega)}</td>
                  <td className="px-4 py-3 text-gray-500">{m.rota.pontos}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium" style={{ color: PRIMARY }}>Abrir →</span>
                  </td>
                </tr>
              ))}
              {manifests.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum manifesto encontrado. Faça um upload na aba Guias de Remessa para gerar o primeiro ciclo.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
