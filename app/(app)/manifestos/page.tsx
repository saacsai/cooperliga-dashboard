import { createServerSupabase } from '@/lib/supabase-server'
import Link from 'next/link'
import type { Manifesto } from '@/lib/supabase'

const STATUS_LABEL: Record<Manifesto['status'], string> = {
  programado:          'Programado',
  carregando_parcial:  'Carregando',
  carregado:           'Carregado',
  entregue:            'Entregue',
  retorno_ok:          'Retorno OK',
  retorno_pendencia:   'Pendência',
}

const STATUS_COR: Record<Manifesto['status'], string> = {
  programado:          'bg-gray-100 text-gray-600',
  carregando_parcial:  'bg-yellow-100 text-yellow-700',
  carregado:           'bg-blue-100 text-blue-700',
  entregue:            'bg-green-100 text-green-700',
  retorno_ok:          'bg-green-100 text-green-700',
  retorno_pendencia:   'bg-red-100 text-red-700',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default async function ManifestosPage() {
  const sb = await createServerSupabase()

  const { data: manifestos } = await sb
    .from('manifestos')
    .select(`
      id, numero, numero_whatsapp, status,
      data_entrega_inicio, data_entrega_fim, data_receber,
      regiao,
      rotas ( codigo, nome )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Manifestos</h1>
        <Link
          href="/manifestos/processar"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Processar ZIP
        </Link>
      </div>

      {!manifestos?.length ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Nenhum manifesto ainda.<br />
          Clique em <strong>Processar ZIP</strong> para importar as primeiras GRs.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Manifesto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rota</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Entrega</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {manifestos.map((m: any, i: number) => (
                <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3">
                    <Link href={`/manifestos/${m.id}`} className="font-medium text-blue-600 hover:underline">
                      {m.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{m.rotas?.codigo || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{m.regiao || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmt(m.data_entrega_inicio)}
                    {m.data_entrega_fim && m.data_entrega_fim !== m.data_entrega_inicio
                      ? ` – ${fmt(m.data_entrega_fim)}`
                      : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COR[m.status as Manifesto['status']]}`}>
                      {STATUS_LABEL[m.status as Manifesto['status']]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{m.numero_whatsapp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
