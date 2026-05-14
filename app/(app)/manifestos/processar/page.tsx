'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface GrPreview {
  arquivo: string
  cie: string | null
  escola: string | null
  rota: string | null
  seq: number | null
  ok: boolean
  aviso: string | null
}

export default function ProcessarZipPage() {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [ciclo, setCiclo] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GrPreview[] | null>(null)
  const [erro, setErro] = useState('')

  async function handleProcessar() {
    if (!arquivo || !ciclo) { setErro('Selecione o ZIP e informe o ciclo'); return }
    if (!/^\d{4}$/.test(ciclo)) { setErro('Ciclo deve ter 4 dígitos (ex: 0520)'); return }
    setErro('')
    setLoading(true)
    setPreview(null)
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('ciclo', ciclo)
    const res = await fetch('/api/gr/processar-zip', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setErro(data.error || 'Erro ao processar'); return }
    setPreview(data.preview)
  }

  async function handleConfirmar() {
    if (!preview || !ciclo || !arquivo) return
    setLoading(true)
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('ciclo', ciclo)
    fd.append('confirmar', '1')
    const res = await fetch('/api/gr/processar-zip', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setErro(data.error || 'Erro ao gerar manifestos'); return }
    router.push('/manifestos')
  }

  const ok  = preview?.filter(g => g.ok).length ?? 0
  const nok = preview?.filter(g => !g.ok).length ?? 0

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Processar ZIP de GRs</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ciclo (DDMM)</label>
            <input
              type="text"
              placeholder="ex: 0520"
              maxLength={4}
              value={ciclo}
              onChange={e => setCiclo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo ZIP</label>
            <input
              type="file"
              accept=".zip"
              onChange={e => setArquivo(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
            />
          </div>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {!preview ? (
          <button
            onClick={handleProcessar}
            disabled={loading || !arquivo || !ciclo}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processando…' : 'Processar'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-green-700 font-medium">✓ {ok} GRs reconhecidas</span>
              {nok > 0 && <span className="text-red-600 font-medium">✗ {nok} não reconhecidas</span>}
            </div>

            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg text-xs">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Arquivo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">CIE</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Escola</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Rota/Seq</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((g, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${g.ok ? '' : 'bg-red-50'}`}>
                      <td className="px-3 py-1.5 text-gray-500 font-mono truncate max-w-[180px]">{g.arquivo}</td>
                      <td className="px-3 py-1.5">{g.cie || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-700">{g.escola || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{g.rota ? `${g.rota} #${g.seq}` : '—'}</td>
                      <td className="px-3 py-1.5">
                        {g.ok
                          ? <span className="text-green-600">✓</span>
                          : <span className="text-red-600" title={g.aviso || ''}>✗ {g.aviso}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmar}
                disabled={loading || ok === 0}
                className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Gerando manifestos…' : `Confirmar e gerar ${ok} GRs`}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
