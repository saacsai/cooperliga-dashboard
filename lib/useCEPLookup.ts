export interface DadosCEP {
  logradouro: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

export async function buscarCEP(cep: string): Promise<DadosCEP | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const d = await res.json()
    if (d.erro) return null
    return {
      logradouro: d.logradouro || '',
      bairro:     d.bairro     || '',
      municipio:  d.localidade || '',
      uf:         d.uf         || '',
      cep:        `${digits.slice(0, 5)}-${digits.slice(5)}`,
    }
  } catch {
    return null
  }
}
