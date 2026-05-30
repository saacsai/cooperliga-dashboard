export interface DadosCNPJ {
  razao_social: string
  nome_fantasia: string
  endereco: string
  municipio: string
  cep: string
  telefone: string
  email: string
}

function formatarTelefone(s: string): string {
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return s
}

export async function buscarCNPJ(cnpj: string): Promise<DadosCNPJ | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const d = await res.json()
    const logradouro = [d.logradouro, d.numero, d.complemento].filter(Boolean).join(', ')
    const cepRaw = (d.cep || '').replace(/\D/g, '')
    return {
      razao_social:  d.razao_social  || '',
      nome_fantasia: d.nome_fantasia || '',
      endereco:      logradouro,
      municipio:     d.municipio || '',
      cep:           cepRaw.length === 8 ? `${cepRaw.slice(0, 5)}-${cepRaw.slice(5)}` : cepRaw,
      telefone:      formatarTelefone(d.ddd_telefone_1 || ''),
      email:         d.email || '',
    }
  } catch {
    return null
  }
}
