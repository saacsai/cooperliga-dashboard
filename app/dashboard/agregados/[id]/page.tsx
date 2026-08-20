'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import type { Agregado } from '@/lib/supabase'

const PRIMARY = '#072740'

type ManifestoHist = {
  id: string
  numero_base: number
  letra: string
  data_entrega: string
  regiao: string | null
  valor_frete: number | null
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function numDisplay(n: number, l: string) {
  return String(n).padStart(4, '0') + l
}

export default function HistoricoAgregadoPage() {
  const params = useParams()
  const id = params.id as string

  const [agregado,   setAgregado]   = useState<Agregado | null>(null)
  const [manifestos,  setManifestos] = useState<ManifestoHist[]>([])
  const [loading,     setLoading]    = useState(true)
  const [editandoId,  setEditandoId] = useState<string | null>(null)
  const [valorInput,  setValorInput] = useState('')
  const [salvando,    setSalvando]   = useState(false)

  const carregar = useCallback(async () => {
    const sb = getSupabase()
    const [{ data: a }, { data: m }] = await Promise.all([
      sb.from('agregados').select('*').eq('id', id).single(),
      sb.from('ciclo_manifestos')
        .select('id, numero_base, letra, data_entrega, regiao, valor_frete')
        .eq('agregado_id', id)
        .order('data_entrega', { ascending: false }),
    ])
    setAgregado(a as Agregado | null)
    setManifestos((m || []) as ManifestoHist[])
    setLoading(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  function abrirEdicao(m: ManifestoHist) {
    setEditandoId(m.id)
    setValorInput(m.valor_frete != null ? String(m.valor_frete) : '')
  }

  async function salvarValor(manifestoId: string) {
    setSalvando(true)
    const valor = valorInput ? parseFloat(valorInput.replace(',', '.')) : null
    const { error } = await getSupabase()
      .from('ciclo_manifestos')
      .update({ valor_frete: valor })
      .eq('id', manifestoId)
    if (!error) {
      setManifestos(prev => prev.map(m => m.id === manifestoId ? { ...m, valor_frete: valor } : m))
      setEditandoId(null)
    }
    setSalvando(false)
  }

  const totalFrete = manifestos.reduce((s, m) => s + (m.valor_frete || 0), 0)

  return (
    <div className="pt-4">
      <a href="/dashboard/agregados" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-4 w-fit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Voltar para Agregados
      </a>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : !agregado ? (
        <p className="text-sm text-gray-400">Agregado não encontrado.</p>
      ) : (
        <>
          <div className="flex items-start justify-between mb-6 flex-wrap gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{agregado.nome}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Histórico de manifestos
                {agregado.valor_frete_padrao != null && (
                  <> · frete padrão R$ {agregado.valor_frete_padrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</>
                )}
              </p>
            </div>
            {manifestos.length > 0 && (
              <span className="text-xs font-mono font-semibold bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg">
                Total: R$ {totalFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-20">Nº</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Região</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entrega</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Valor do frete</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {manifestos.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/30">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{numDisplay(m.numero_base, m.letra)}</td>
                    <td className="px-4 py-3 text-gray-800">{m.regiao || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(m.data_entrega)}</td>
                    <td className="px-4 py-3">
                      {editandoId === m.id ? (
                        <div className="flex items-center gap-2">
                          <input type="number" step="0.01" autoFocus value={valorInput}
                            onChange={e => setValorInput(e.target.value)} placeholder="0,00"
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#072740]" />
                          <button onClick={() => salvarValor(m.id)} disabled={salvando}
                            className="text-xs font-medium disabled:opacity-50" style={{ color: PRIMARY }}>
                            {salvando ? '…' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditandoId(null)} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
                        </div>
                      ) : (
                        <span className="text-gray-700 font-mono">
                          {m.valor_frete != null ? `R$ ${m.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editandoId !== m.id && (
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => abrirEdicao(m)} className="text-xs font-medium hover:opacity-80" style={{ color: PRIMARY }}>Editar</button>
                          <a href="/dashboard/manifestos" className="text-xs text-gray-400 hover:text-gray-700">Abrir</a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {manifestos.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhum manifesto atribuído a este agregado ainda.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
