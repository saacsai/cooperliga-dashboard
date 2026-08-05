import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── Google Maps Geocoding ───────────────────────────────────────────────────
async function geocodeGoogle(
  endereco: string,
  municipio: string | null,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  const cidade = municipio || 'São Paulo'
  const query  = `${endereco}, ${cidade}, SP, Brasil`

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
    const loc = data.results[0].geometry.location
    return { lat: loc.lat as number, lng: loc.lng as number }
  } catch {
    return null
  }
}

// ── Nominatim (fallback quando não há API key) ──────────────────────────────
function parseEndereco(raw: string): { street: string; housenumber: string } {
  let s = raw.toUpperCase().trim()
  s = s.replace(/\s+COM\s+(RUA|AV\.?|AVENIDA|TRAVESSA|TRAV\.?)\s+.*/i, '')

  let housenumber = ''
  const numMatch = s.match(/N[Oº°\.]\s*(\d+[A-Z]?(?:\s*[/\-]\s*\d+[A-Z]?)?)/i)
  if (numMatch) {
    housenumber = numMatch[1].replace(/[A-Za-z]$/, '').replace(/\s*[/\-].*/, '').trim()
    s = s.replace(numMatch[0], '').trim()
  }
  if (!housenumber) {
    const trailingNum = s.match(/\s+(\d+[A-Z]?)$/)
    if (trailingNum) {
      housenumber = trailingNum[1].replace(/[A-Za-z]$/, '')
      s = s.slice(0, s.length - trailingNum[0].length).trim()
    }
  }

  s = s
    .replace(/^R\.\s+/,    'RUA ')
    .replace(/^AV\.\s+/,   'AVENIDA ')
    .replace(/^AL\.\s+/,   'ALAMEDA ')
    .replace(/^PÇA?\.\s+/, 'PRAÇA ')
    .replace(/^TRAV\.\s+/, 'TRAVESSA ')
    .replace(/^EST\.\s+/,  'ESTRADA ')
    .replace(/^PC\.\s+/,   'PRAÇA ')
    .replace(/\bS\/N\b/gi, '')
    .trim()

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
  const { data: pontos } = await sb
    .from('pontos_de_entrega')
    .select('id, endereco, municipio, geo_status')
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
      ? await geocodeGoogle(p.endereco, p.municipio, apiKey)
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
