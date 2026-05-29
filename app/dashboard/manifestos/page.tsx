export default function ManifestosPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Manifestos</h1>
      <p className="text-sm text-gray-500 mb-8">Ciclos de entrega e status das rotas</p>

      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-sm font-medium text-gray-700">Em construção</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs">
          O painel de manifestos estará disponível na Fase 2b, com processamento automático de GRs e geração de PDF por rota.
        </p>
      </div>
    </div>
  )
}
