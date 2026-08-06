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

async function geocodeGoogle(
  endereco: string,
  municipio: string | null,
  apiKey: string,
  centroide: { lat: number; lng: number } | null,
  cep?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const cidade   = municipio || 'São Paulo'
  const endNorm  = normalizarEndereco(endereco)
  const query    = cep
    ? `${endNorm}, ${cep}, Brasil`
    : `${endNorm}, ${cidade}, SP, Brasil`

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address',  query)
  url.searchParams.set('key',      apiKey)
  url.searchParams.set('region',   'br')
  url.searchParams.set('language', 'pt-BR')

  try {
    const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) return null

    // Com centróide disponível, escolhe o resultado mais próximo do cluster
    if (centroide && data.results.length > 1) {
      const melhor = data.results.reduce((best: { lat: number; lng: number }, curr: { geometry: { location: { lat: number; lng: number } } }) => {
        const loc  = curr.geometry.location
        const dCur = distGeo(loc.lat, loc.lng, centroide.lat, centroide.lng)
        const dBst = distGeo(best.lat, best.lng, centroide.lat, centroide.lng)
        return dCur < dBst ? { lat: loc.lat, lng: loc.lng } : best
      }, { lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng })
      return melhor
    }

    const loc = data.results[0].geometry.location
    return { lat: loc.lat as number, lng: loc.lng as number }
  } catch {
    return null
  }
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

async function fetchNominatim(url: string): Promise<{ lat: number; lng: number } | null> {
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
): Promise<{ lat: number; lng: number } | null> {
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
    .select('id, endereco, municipio, cep, geo_status')
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
      ? await geocodeGoogle(p.endereco, p.municipio, apiKey, centroide, p.cep)
      : await geocodeNominatim(p.endereco, p.municipio)

    // Nominatim exige 1 req/sec; Google não tem esse limite
    if (!useGoogle) await delay(1100)

    if (coords) {
      await sb.from('pontos_de_entrega')
        .update({ lat: coords.lat, lng: coords.lng, geo_status: 'ok' })
        .eq('id', p.id)
      processados++
    } else {
      await sb.from('pontos_de_entrega').update({ geo_status: 'nao_encontrado' }).eq('id', p.id)
      erros++
    }
  }

  return NextResponse.json({ processados, erros, provider: useGoogle ? 'google' : 'nominatim' })
}
