'use client'

import { useRef, useState, useCallback } from 'react'

const PRIMARY  = '#5C0F0F'
const WORKER   = 'https://guias.cooperliga.saacs.com.br'

type Tab = 'estado' | 'municipal'

interface CampoArquivo {
  name: string
  label: string
  hint: string
  accept: string
  multiple: boolean
  fieldName: string
}

const CAMPOS_ESTADO: CampoArquivo[] = [
  { fieldName: 'zip_grs',      name: 'zip_grs',      label: 'ZIP com todas as GRs do ciclo',         hint: 'Um único .zip com todos os PDFs das guias de remessa da SEE-SP',                                   accept: '.zip',       multiple: false },
  { fieldName: 'folhas_rosto', name: 'folhas_rosto',  label: 'Folhas de rosto (PDF)',                  hint: 'Selecione todos os PDFs de rota de uma vez. Ex: ROTA 1 - SANTO ANDRE.pdf...',                      accept: '.pdf',       multiple: true  },
]

const CAMPOS_MUNICIPAL: CampoArquivo[] = [
  { fieldName: 'pdf_grs',      name: 'pdf_grs',       label: 'PDFs de GRs (Prefeitura)',              hint: 'Um ou mais PDFs enviados pela Prefeitura com as guias de remessa do ciclo',                        accept: '.pdf',       multiple: true  },
  { fieldName: 'xls_grs',      name: 'xls_grs',       label: 'XLS de GRs (solicitação)',              hint: 'Planilha(s) com CODIGO_UNIDADE e Nº_GUIA_REMESSA — uma por alimento/solicitação',                  accept: '.xlsx,.xls', multiple: true  },
  { fieldName: 'xls_rota',     name: 'xls_rota',      label: 'XLS de rota (ordem de entrega)',         hint: 'Uma ou mais planilhas de rota. O nome deve ser igual ao PDF de capa correspondente',               accept: '.xlsx,.xls', multiple: true  },
  { fieldName: 'folhas_rosto', name: 'folhas_rosto',  label: 'Folhas de rosto das rotas (PDF)',        hint: 'PDFs convertidos do XLS de rota — nome deve coincidir. Ex: "ROTA 1.xlsx" → "ROTA 1.pdf"',          accept: '.pdf',       multiple: true  },
]

function CampoUpload({
  campo, acumulados, onChange, onRemover,
}: {
  campo: CampoArquivo
  acumulados: File[]
  onChange: (fieldName: string, files: FileList) => void
  onRemover: (fieldName: string, idx: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-gray-800 mb-0.5">{campo.label}</label>
      <p className="text-xs text-gray-400 mb-2">{campo.hint}</p>
      <input
        ref={ref}
        type="file"
        accept={campo.accept}
        multiple={campo.multiple}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:text-white file:cursor-pointer cursor-pointer"
        style={{ '--file-bg': PRIMARY } as React.CSSProperties}
        onChange={e => { if (e.target.files?.length) onChange(campo.fieldName, e.target.files) }}
      />
      {acumulados.length > 0 && (
        <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 overflow-hidden">
          {acumulados.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-xs">
              <span className="flex-1 truncate text-gray-700">{f.name}</span>
              <button type="button" onClick={() => onRemover(campo.fieldName, i)}
                className="text-red-400 hover:text-red-600 font-bold text-base leading-none px-1">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GuiasPage() {
  const [tab, setTab]           = useState<Tab>('estado')
  const [status, setStatus]     = useState<'idle' | 'loading' | 'error'>('idle')
  const [erro, setErro]         = useState('')
  const [processando, setProc]  = useState<Tab | null>(null)
  const [filesEstado,   setFilesEstado]   = useState<Record<string, File[]>>({})
  const [filesMunicipal, setFilesMunicipal] = useState<Record<string, File[]>>({})

  const getFiles = (t: Tab) => t === 'estado' ? filesEstado : filesMunicipal

  const handleChange = useCallback((t: Tab) => (fieldName: string, incoming: FileList) => {
    const setter = t === 'estado' ? setFilesEstado : setFilesMunicipal
    setter(prev => {
      const prev_list = prev[fieldName] || []
      const nomes = new Set(prev_list.map((f: File) => f.name))
      const merged = [...prev_list, ...Array.from(incoming).filter(f => !nomes.has(f.name))]
      return { ...prev, [fieldName]: merged }
    })
  }, [])

  const handleRemover = useCallback((t: Tab) => (fieldName: string, idx: number) => {
    const setter = t === 'estado' ? setFilesEstado : setFilesMunicipal
    setter(prev => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter((_: File, i: number) => i !== idx),
    }))
  }, [])

  async function handleSubmit(t: Tab) {
    const campos   = t === 'estado' ? CAMPOS_ESTADO : CAMPOS_MUNICIPAL
    const files    = getFiles(t)
    const endpoint = t === 'estado' ? `${WORKER}/processar` : `${WORKER}/processar/municipal`

    for (const c of campos) {
      if ((files[c.fieldName] || []).length === 0) {
        setErro(`Campo obrigatório: ${c.label}`)
        setStatus('error')
        return
      }
    }
    const dataCiclo = (document.getElementById(`data_ciclo_${t}`) as HTMLInputElement)?.value
    if (!dataCiclo || dataCiclo.length !== 4) {
      setErro('Preencha a data do ciclo (4 dígitos)')
      setStatus('error')
      return
    }

    setStatus('loading'); setErro(''); setProc(t)

    try {
      const fd = new FormData()
      for (const c of campos) {
        for (const f of files[c.fieldName] || []) fd.append(c.fieldName, f)
      }
      fd.append('data_ciclo', dataCiclo)

      const res = await fetch(endpoint, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') || ''
      const m    = cd.match(/filename=(.+)/)
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = m ? m[1] : 'cooperliga.zip'
      a.click()
      URL.revokeObjectURL(a.href)
      setStatus('idle')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
      setStatus('error')
    } finally {
      setProc(null)
    }
  }

  const campos  = tab === 'estado' ? CAMPOS_ESTADO : CAMPOS_MUNICIPAL
  const files   = getFiles(tab)
  const loading = processando === tab

  return (
    <div className="max-w-2xl pt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Guias de Remessa</h1>
      <p className="text-sm text-gray-500 mb-6">Organiza as GRs por rota para impressão e entrega</p>

      <div className="flex mb-0">
        {(['estado', 'municipal'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setStatus('idle'); setErro('') }}
            className="flex-1 py-2.5 text-sm font-semibold transition-colors border"
            style={{
              background:   tab === t ? PRIMARY : '#FAF5F5',
              color:        tab === t ? '#fff' : '#6b7280',
              borderColor:  tab === t ? PRIMARY : '#e5e7eb',
              borderBottom: tab === t ? `2px solid ${PRIMARY}` : '1px solid #e5e7eb',
              borderRadius: t === 'estado' ? '8px 0 0 0' : '0 8px 0 0',
            }}>
            {t === 'estado' ? 'Estado (SEE-SP)' : 'Prefeitura (Municipal)'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-b-xl rounded-tr-xl p-6">
        <div className="mb-5 space-y-2">
          {tab === 'estado' ? (
            <>
              <Step n={1}>Baixe o ZIP com todas as GRs do ciclo do sistema da SEE-SP</Step>
              <Step n={2}>Exporte as folhas de rosto para PDF (uma por rota)</Step>
              <Step n={3}>Preencha os campos abaixo e clique em Gerar</Step>
            </>
          ) : (
            <>
              <Step n={1}>Baixe os PDFs de GRs e os XLS de solicitação enviados pela Prefeitura</Step>
              <Step n={2}>Converta cada XLS de rota para PDF mantendo o mesmo nome de arquivo</Step>
              <Step n={3}>Suba todos os arquivos — o sistema pareia rota + capa pelo nome e gera o PDF com triplicata</Step>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 my-5" />

        {campos.map(c => (
          <CampoUpload
            key={`${tab}-${c.fieldName}`}
            campo={c}
            acumulados={files[c.fieldName] || []}
            onChange={handleChange(tab)}
            onRemover={handleRemover(tab)}
          />
        ))}

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-800 mb-0.5">Data do ciclo</label>
          <p className="text-xs text-gray-400 mb-2">
            {tab === 'estado' ? 'Formato MMDD — ex: 0506 para semana de 06 de maio' : 'Formato DDMM — ex: 2503 para entrega de 25 de março'}
          </p>
          <input
            id={`data_ciclo_${tab}`}
            type="text"
            placeholder={tab === 'estado' ? '0506' : '2503'}
            maxLength={4}
            pattern="[0-9]{4}"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none w-28 tracking-widest font-mono focus:border-[#5C0F0F]"
          />
        </div>

        {status === 'loading' && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#FEF9C3', color: '#854D0E', border: '1px solid #FDE68A' }}>
            ⏳ Processando as GRs e gerando o PDF…
          </div>
        )}
        {status === 'error' && erro && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
            ❌ {erro}
          </div>
        )}

        <button onClick={() => handleSubmit(tab)} disabled={loading}
          className="w-full py-3 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: PRIMARY }}>
          {loading ? 'Processando… aguarde' : tab === 'estado' ? 'Gerar Rotas →' : 'Gerar PDF Municipal →'}
        </button>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-gray-500">
      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
        style={{ background: '#F5EFEF', color: PRIMARY }}>{n}</span>
      <span>{children}</span>
    </div>
  )
}
