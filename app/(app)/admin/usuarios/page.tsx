import { createServerSupabase } from '@/lib/supabase-server'

const PERFIL_COR: Record<string, string> = {
  admin:      'bg-red-100 text-red-700',
  gestor:     'bg-purple-100 text-purple-700',
  analista:   'bg-blue-100 text-blue-700',
  financeiro: 'bg-green-100 text-green-700',
  operador:   'bg-gray-100 text-gray-600',
}

export default async function UsuariosPage() {
  const sb = await createServerSupabase()
  const { data: usuarios } = await sb
    .from('usuarios')
    .select('id, nome, email, perfil, whatsapp, ativo')
    .order('nome')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
        <p className="text-xs text-gray-500">
          Para adicionar usuários: crie no Supabase Auth → copie o UUID → insira na tabela <code>usuarios</code>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {(usuarios || []).map((u: any) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                <td className="px-4 py-3 text-gray-500">{u.email || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PERFIL_COR[u.perfil] || 'bg-gray-100 text-gray-600'}`}>
                    {u.perfil}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{u.whatsapp || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
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
