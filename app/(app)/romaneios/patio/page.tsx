import { createServerSupabase } from '@/lib/supabase-server'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default async function PatioPage() {
  const sb = await createServerSupabase()

  const { data: entradas } = await sb
    .from('romaneio_entrada')
    .select('id, semana_ref, data, total_caixas, clientes(nome, codigo)')
    .order('data', { ascending: false })
    .limit(30)

  const { data: saidas } = await sb
    .from('romaneio_saida')
    .select('id, semana_ref, data, total_caixas, clientes(nome, codigo)')
    .order('data', { ascending: false })
    .limit(30)

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Romaneios — Pátio</h1>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Entradas</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Ciclo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Data</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Cliente</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Caixas</th>
                </tr>
              </thead>
              <tbody>
                {(entradas || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">Sem registros</td></tr>
                ) : (entradas || []).map((e: any) => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-500">{e.semana_ref}</td>
                    <td className="px-4 py-2.5 text-gray-700">{fmt(e.data)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.clientes?.codigo || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{e.total_caixas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Saídas</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Ciclo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Data</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Cliente</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Caixas</th>
                </tr>
              </thead>
              <tbody>
                {(saidas || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">Sem registros</td></tr>
                ) : (saidas || []).map((s: any) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-500">{s.semana_ref}</td>
                    <td className="px-4 py-2.5 text-gray-700">{fmt(s.data)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{s.clientes?.codigo || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{s.total_caixas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
