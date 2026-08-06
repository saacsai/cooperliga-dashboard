import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address  = searchParams.get('address') || ''
  const nome     = searchParams.get('nome') || ''
  const municipio = searchParams.get('municipio') || 'São Paulo'
  const apiKey   = process.env.GOOGLE_MAPS_API_KEY || ''

  if (!apiKey) return NextResponse.json({ erro: 'sem API key' }, { status: 500 })

  async function query(q: string, withComponents: boolean) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address',  q)
    url.searchParams.set('key',      apiKey)
    url.searchParams.set('region',   'br')
    url.searchParams.set('language', 'pt-BR')
    if (withComponents) {
      const c = ['country:BR', 'administrative_area_level_1:SP']
      if (municipio) c.push(`locality:${municipio}`)
      url.searchParams.set('components', c.join('|'))
    }
    const res  = await fetch(url.toString())
    const data = await res.json()
    return {
      query: q,
      components: withComponents,
      status: data.status,
      results: (data.results || []).map((r: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: { types: string[]; long_name: string }[] }) => ({
        formatted_address: r.formatted_address,
        location: r.geometry?.location,
        postal_code: r.address_components?.find((c: { types: string[] }) => c.types.includes('postal_code'))?.long_name,
      })),
    }
  }

  const resultados = await Promise.all([
    address ? query(`${address}, ${municipio}, SP, Brasil`, true) : null,
    address ? query(`${address}, ${municipio}, SP, Brasil`, false) : null,
    nome    ? query(`${nome}, ${municipio}, SP, Brasil`, false) : null,
  ])

  return NextResponse.json(resultados.filter(Boolean))
}
