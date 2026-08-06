import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat    = searchParams.get('lat')
  const lng    = searchParams.get('lng')
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || ''

  if (!lat || !lng || !apiKey) return NextResponse.json({ cep: null })

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('latlng',   `${lat},${lng}`)
    url.searchParams.set('key',      apiKey)
    url.searchParams.set('language', 'pt-BR')

    const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) return NextResponse.json({ cep: null })

    const cepRaw = data.results[0].address_components
      ?.find((c: { types: string[] }) => c.types.includes('postal_code'))
      ?.long_name as string | undefined

    return NextResponse.json({ cep: cepRaw?.replace(/\D/g, '') ?? null })
  } catch {
    return NextResponse.json({ cep: null })
  }
}
