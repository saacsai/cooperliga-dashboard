export default function GuiasPage() {
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Guias de Remessa</h1>
        <p className="text-sm text-gray-500">Gerador de rotas — organiza GRs por rota para impressão e entrega</p>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ minHeight: 600 }}>
        <iframe
          src="https://guias.cooperliga.saacs.com.br"
          className="w-full h-full border-0"
          style={{ minHeight: 600 }}
          title="Gerador de Guias de Remessa"
        />
      </div>
    </div>
  )
}
