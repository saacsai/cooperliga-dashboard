import { createServerSupabase } from '@/lib/supabase-server'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function FinanceiroDashboardPage() {
  const sb = await createServerSupabase()

  const [{ data: faturas }, { data: notas }, { data: despesas }, { data: movs }] = await Promise.all([
    sb.from('faturas').select('valor_total, status'),
    sb.from('notas_fiscais').select('nf_valor, status'),
    sb.from('despesas').select('valor, status'),
    sb.from('movimentacoes_caixa').select('tipo, valor'),
  ])

  const aReceber = (faturas || [])
    .filter((f: any) => ['emitida', 'inadimplente'].includes(f.status))
    .reduce((s: number, f: any) => s + Number(f.valor_total || 0), 0)

  const aPagarNFs = (notas || [])
    .filter((n: any) => n.status === 'aprovada')
    .reduce((s: number, n: any) => s + Number(n.nf_valor || 0), 0)

  const aPagarDespesas = (despesas || [])
    .filter((d: any) => d.status === 'pendente')
    .reduce((s: number, d: any) => s + Number(d.valor || 0), 0)

  const aPagar = aPagarNFs + aPagarDespesas

  const caixa = (movs || []).reduce((s: number, m: any) =>
    s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0)

  const posicaoLiquida = caixa + aReceber - aPagar

  const cards = [
    { label: 'Caixa', valor: caixa, cor: caixa >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'A Receber', valor: aReceber, cor: 'text-blue-600' },
    { label: 'A Pagar', valor: aPagar, cor: 'text-amber-600' },
    { label: 'Posição Líquida', valor: posicaoLiquida, cor: posicaoLiquida >= 0 ? 'text-green-600' : 'text-red-600', destaque: true },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Fluxo de Estoques</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className={`bg-white border rounded-xl p-5 ${c.destaque ? 'border-blue-200' : 'border-gray-200'}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.cor}`}>{brl(c.valor)}</p>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Posição Líquida</strong> = Caixa + A Receber − A Pagar
        <br />
        <span className="text-xs text-blue-500">Fórmula: {brl(caixa)} + {brl(aReceber)} − {brl(aPagar)} = {brl(posicaoLiquida)}</span>
      </div>
    </div>
  )
}
