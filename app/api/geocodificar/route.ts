import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── Normalização de endereço compartilhada ──────────────────────────────────
function normalizarEndereco(raw: string): string {
  return raw
    .replace(/^R[-\.]\s+/i,    'Rua ')
    .replace(/^AV[-\.]\s+/i,   'Avenida ')
    .replace(/^AL[-\.]\s+/i,   'Alameda ')
    .replace(/^PÇA?[-\.]\s+/i, 'Praça ')
    .replace(/^TRAV[-\.]\s+/i, 'Travessa ')
    .replace(/^EST[-\.]\s+/i,  'Estrada ')
    .replace(/^PC[-\.]\s+/i,   'Praça ')
    .replace(/\bS\/N\b/gi,     '')
    .replace(/\s+COM\s+(RUA|AV\.?|AVENIDA|TRAVESSA|TRAV\.?)\s+.*/i, '')
    .trim()
}

// ── Google Maps Geocoding ───────────────────────────────────────────────────
function distGeo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.hypot(lat1 - lat2, lng1 - lng2)
}

type GeoResult = { lat: number; lng: number; cep?: string }

function extrairCep(result: { address_components?: { types: string[]; long_name: string }[] }): string | undefined {
  return result.address_components
    ?.find(c => c.types.includes('postal_code'))
    ?.long_name
    ?.replace(/\D/g, '')  // garante somente dígitos (remove hífen se vier)
    || undefined
}

async function fetchGoogleResults(
  query: string,
  apiKey: string,
  municipio: string | null,
  centroide: { lat: number; lng: number } | null,
): Promise<unknown[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address',  query)
  url.searchParams.set('key',      apiKey)
  url.searchParams.set('region',   'br')
  url.searchParams.set('language', 'pt-BR')
  const components = ['country:BR', 'administrative_area_level_1:SP']
  if (municipio) components.push(`locality:${municipio}`)
  url.searchParams.set('components', components.join('|'))
  if (centroide) {
    const d = 0.8
    url.searchParams.set('bounds',
      `${centroide.lat - d},${centroide.lng - d}|${centroide.lat + d},${centroide.lng + d}`)
  }
  try {
    const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    return data.status === 'OK' && data.results?.length ? data.results : []
  } catch {
    return []
  }
}

async function geocodeGoogle(
  endereco: string,
  municipio: string | null,
  apiKey: string,
  centroide: { lat: number; lng: number } | null,
  nome?: string | null,
): Promise<GeoResult | null> {
  const cidade  = municipio || 'São Paulo'
  const endNorm = normalizarEndereco(endereco)

  type Resultado = { geometry: { location: { lat: number; lng: number } }; address_components?: { types: string[]; long_name: string }[] }

  const byAddr = await fetchGoogleResults(`${endNorm}, ${cidade}, SP, Brasil`, apiKey, municipio, centroide) as Resultado[]

  // Se todos os resultados estiverem longe do centróide (>0.5° ≈ 55 km), tenta pelo nome
  const DIST_SUSPEITA = 0.5
  const suspeito = centroide && byAddr.length > 0 && byAddr.every(r =>
    distGeo(r.geometry.location.lat, r.geometry.location.lng, centroide.lat, centroide.lng) > DIST_SUSPEITA
  )

  let candidatos = byAddr
  if ((suspeito || !byAddr.length) && nome) {
    const byNome = await fetchGoogleResults(`${nome}, ${cidade}, SP, Brasil`, apiKey, municipio, centroide) as Resultado[]
    candidatos = [...byAddr, ...byNome]
  }

  if (!candidatos.length) return null

  const escolhido = centroide && candidatos.length > 1
    ? candidatos.reduce((best, curr) =>
        distGeo(curr.geometry.location.lat, curr.geometry.location.lng, centroide.lat, centroide.lng)
      < distGeo(best.geometry.location.lat, best.geometry.location.lng, centroide.lat, centroide.lng)
        ? curr : best)
    : candidatos[0]

  const loc = escolhido.geometry.location
  return { lat: loc.lat as number, lng: loc.lng as number, cep: extrairCep(escolhido) }
}

// ── Nominatim (fallback quando não há API key) ──────────────────────────────
function parseEndereco(raw: string): { street: string; housenumber: string } {
  let s = raw.toUpperCase().trim()

  let housenumber = ''
  // Extrai "No 151", "Nº 02", "N. 33" etc.
  const numMatch = s.match(/N[Oº°\.]\s*(\d+[A-Z]?(?:\s*[/\-]\s*\d+[A-Z]?)?)/i)
  if (numMatch) {
    housenumber = numMatch[1].replace(/[A-Za-z]$/, '').replace(/\s*[/\-].*/, '').trim()
    s = s.replace(numMatch[0], '').trim()
  }
  // Extrai "no 2" no final da string (virgula separa complemento)
  const commaIdx = s.indexOf(',')
  const searchPart = commaIdx >= 0 ? s.slice(0, commaIdx) : s
  if (!housenumber) {
    const trailingNum = searchPart.match(/\s+(\d+[A-Z]?)$/)
    if (trailingNum) {
      housenumber = trailingNum[1].replace(/[A-Za-z]$/, '')
      s = s.slice(0, s.length - trailingNum[0].length).trim()
    }
  }

  s = normalizarEndereco(s).toUpperCase()

  return { street: s, housenumber }
}

async function fetchNominatim(url: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CooperLiga/1.0 (cooperliga.saacs.com.br)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

async function geocodeNominatim(
  endereco: string,
  municipio: string | null,
): Promise<GeoResult | null> {
  const cidade = municipio || 'São Paulo'
  const { street, housenumber } = parseEndereco(endereco)

  const url1 = new URL('https://nominatim.openstreetmap.org/search')
  url1.searchParams.set('street',  housenumber ? `${housenumber} ${street}` : street)
  url1.searchParams.set('city',    cidade)
  url1.searchParams.set('country', 'Brazil')
  url1.searchParams.set('format',  'json')
  url1.searchParams.set('limit',   '1')

  const coords1 = await fetchNominatim(url1.toString())
  if (coords1) return coords1

  await delay(1100)

  if (housenumber) {
    const url2 = new URL('https://nominatim.openstreetmap.org/search')
    url2.searchParams.set('street',  street)
    url2.searchParams.set('city',    cidade)
    url2.searchParams.set('country', 'Brazil')
    url2.searchParams.set('format',  'json')
    url2.searchParams.set('limit',   '1')
    return fetchNominatim(url2.toString())
  }

  return null
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Handler principal ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ processados: 0, erros: 0 })
  }

  const apiKey    = process.env.GOOGLE_MAPS_API_KEY || ''
  const useGoogle = !!apiKey

  const sb = getSupabaseAdmin()

  // Calcular centróide dos pontos já geocodificados para escolher resultado mais próximo
  let centroide: { lat: number; lng: number } | null = null
  if (useGoogle) {
    const { data: jaGeo } = await sb
      .from('pontos_de_entrega')
      .select('lat, lng')
      .eq('geo_status', 'ok')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
    if (jaGeo && jaGeo.length >= 3) {
      centroide = {
        lat: jaGeo.reduce((s, p) => s + (p.lat as number), 0) / jaGeo.length,
        lng: jaGeo.reduce((s, p) => s + (p.lng as number), 0) / jaGeo.length,
      }
    }
  }

  const { data: pontos } = await sb
    .from('pontos_de_entrega')
    .select('id, nome, endereco, municipio, cep, geo_status')
    .in('id', ids)

  let processados = 0
  let erros       = 0

  for (const p of pontos || []) {
    if (!p.endereco) {
      await sb.from('pontos_de_entrega').update({ geo_status: 'sem_endereco' }).eq('id', p.id)
      erros++
      continue
    }

    const coords = useGoogle
      ? await geocodeGoogle(p.endereco, p.municipio, apiKey, centroide, p.nome)
      : await geocodeNominatim(p.endereco, p.municipio)

    // Nominatim exige 1 req/sec; Google não tem esse limite
    if (!useGoogle) await delay(1100)

    if (coords) {
      const update: Record<string, unknown> = { lat: coords.lat, lng: coords.lng, geo_status: 'ok' }
      if (coords.cep) update.cep = coords.cep  // sobrescreve CEP anterior (correto > errado)
      await sb.from('pontos_de_entrega').update(update).eq('id', p.id)
      processados++
    } else {
      await sb.from('pontos_de_entrega').update({ geo_status: 'nao_encontrado' }).eq('id', p.id)
      erros++
    }
  }

  return NextResponse.json({ processados, erros, provider: useGoogle ? 'google' : 'nominatim' })
}
