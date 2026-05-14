import { createServerSupabase } from '@/lib/supabase-server'

export default async function RotasPage() {
  const sb = await createServerSupabase()
  const { data: rotas } = await sb
    .from('rotas')
    .select('id, codigo, nome, regiao, valor_frete, ativo, agregados(nome)')
    .order('codigo')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Rotas</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Motorista</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Frete</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {(rotas || []).map((r: any) => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{r.codigo}</td>
                <td className="px-4 py-3 text-gray-700">{r.nome}</td>
                <td className="px-4 py-3 text-gray-500">{r.regiao || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{r.agregados?.nome || <span className="text-amber-600 text-xs">Não vinculado</span>}</td>
                <td className="px-4 py-3 text-gray-500">
                  {r.valor_frete != null ? `R$ ${Number(r.valor_frete).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
