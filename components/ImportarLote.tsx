'use client'

import { useRef, useState } from 'react'

interface Coluna { key: string; label: string }

interface Props {
  colunas: Coluna[]
  onImportar: (rows: Record<string, string>[]) => Promise<void>
  primaryColor?: string
}

export default function ImportarLote({ colunas, onImportar, primaryColor = '#5C0F0F' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [msg,    setMsg]    = useState('')

  function baixarModelo() {
    const header = colunas.map(c => `"${c.label}"`).join(';')
    const blob   = new Blob(['﻿' + header + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href = url; a.download = 'modelo_importacao.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('loading'); setMsg('')
    try {
      const text = await file.text()
      const sep  = text.indexOf(';') !== -1 ? ';' : ','
      const linhas = text.replace(/\r/g, '').trim().split('\n').filter(l => l.trim())
      if (linhas.length < 2) { setStatus('erro'); setMsg('Arquivo sem dados.'); return }

      const limpar  = (s: string) => s.trim().replace(/^"|"$/g, '')
      const cabecalho = linhas[0].split(sep).map(limpar)

      const rows = linhas.slice(1).map(linha => {
        const vals = linha.split(sep).map(limpar)
        const row: Record<string, string> = {}
        colunas.forEach(col => {
          const i = cabecalho.findIndex(h => h === col.label)
          row[col.key] = i >= 0 ? vals[i] || '' : ''
        })
        return row
      }).filter(r => Object.values(r).some(v => v))

      if (!rows.length) { setStatus('erro'); setMsg('Nenhuma linha válida encontrada.'); return }
      await onImportar(rows)
      setStatus('ok'); setMsg(`${rows.length} registro(s) importado(s).`)
    } catch (err: unknown) {
      setStatus('erro')
      setMsg(err instanceof Error ? err.message : 'Erro ao processar arquivo.')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={baixarModelo}
        className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors flex items-center gap-1.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Modelo CSV
      </button>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={status === 'loading'}
        className="text-xs font-medium border rounded-lg px-3 py-1.5 hover:opacity-80 transition-opacity flex items-center gap-1.5 disabled:opacity-40"
        style={{ borderColor: primaryColor, color: primaryColor }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {status === 'loading' ? 'Importando…' : 'Importar CSV'}
      </button>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleArquivo} />
      {status === 'ok'   && <span className="text-xs text-green-600">{msg}</span>}
      {status === 'erro' && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  )
}
