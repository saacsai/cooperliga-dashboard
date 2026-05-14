import { createServerSupabase } from '@/lib/supabase-server'

export default async function EscolasPage() {
  const sb = await createServerSupabase()
  const { data: escolas } = await sb
    .from('pontos_de_entrega')
    .select('id, nome, codigo_estado, municipio, endereco, ativo')
    .order('municipio')
    .order('nome')

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Escolas
          <span className="ml-2 text-sm font-normal text-gray-400">({escolas?.length || 0})</span>
        </h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">CIE</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Município</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Endereço</th>
            </tr>
          </thead>
          <tbody>
            {(escolas || []).map((e: any) => (
              <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{e.codigo_estado || '—'}</td>
                <td className="px-4 py-2.5 text-gray-900">{e.nome}</td>
                <td className="px-4 py-2.5 text-gray-500">{e.municipio || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{e.endereco || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
