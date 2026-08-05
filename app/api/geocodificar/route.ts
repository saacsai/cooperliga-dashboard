import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Limpa e normaliza endereço brasileiro para melhorar o hit-rate do Nominatim.
// Retorna { street, housenumber } para busca estruturada.
function parseEndereco(raw: string): { street: string; housenumber: string } {
  let s = raw.toUpperCase().trim()

  // Remover "COM RUA / AV / TRAV X" (endereços de esquina)
  s = s.replace(/\s+COM\s+(RUA|AV\.?|AVENIDA|TRAVESSA|TRAV\.?)\s+.*/i, '')

  // Extrair número (após "Nº", "N°", "N.") — captura dígitos + letra opcional
  let housenumber = ''
  const numMatch = s.match(/N[Oº°\.]\s*(\d+[A-Z]?(?:\s*[/\-]\s*\d+[A-Z]?)?)/i)
  if (numMatch) {
    // Pegar só os dígitos, ignorar sufixo de letra e segunda parte
    housenumber = numMatch[1].replace(/[A-Za-z]$/, '').replace(/\s*[/\-].*/,'').trim()
    s = s.replace(numMatch[0], '').trim()
  }
  // Fallback: número solto no final da string (ex: "RUA FULANO 151")
  if (!housenumber) {
    const trailingNum = s.match(/\s+(\d+[A-Z]?)$/)
    if (trailingNum) {
      housenumber = trailingNum[1].replace(/[A-Za-z]$/, '')
      s = s.slice(0, s.length - trailingNum[0].length).trim()
    }
  }

  // Expandir abreviações de logradouro
  s = s
    .replace(/^R\.\s+/,        'RUA ')
    .replace(/^AV\.\s+/,       'AVENIDA ')
    .replace(/^AL\.\s+/,       'ALAMEDA ')
    .replace(/^PÇA?\.\s+/,     'PRAÇA ')
    .replace(/^TRAV\.\s+/,     'TRAVESSA ')
    .replace(/^EST\.\s+/,      'ESTRADA ')
    .replace(/^PC\.\s+/,       'PRAÇA ')
    // Remover "S/N" residual
    .replace(/\bS\/N\b/gi, '')
    .trim()

  return { street: s, housenumber }
}

async function geocodificarEndereco(
  endereco: string,
  municipio: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const cidade = municipio || 'São Paulo'
  const { street, housenumber } = parseEndereco(endereco)

  // Tentativa 1: busca estruturada Nominatim (street + city)
  // O campo "street" do Nominatim aceita "número rua" no mesmo campo
  const streetParam = housenumber ? `${housenumber} ${street}` : street
  const url1 = new URL('https://nominatim.openstreetmap.org/search')
  url1.searchParams.set('street', streetParam)
  url1.searchParams.set('city', cidade)
  url1.searchParams.set('country', 'Brazil')
  url1.searchParams.set('format', 'json')
  url1.searchParams.set('limit', '1')

  const coords1 = await fetchNominatim(url1.toString())
  if (coords1) return coords1

  await delay(1100)

  // Tentativa 2: só o nome da rua, sem número (lida com números mal formatados)
  if (housenumber) {
    const url2 = new URL('https://nominatim.openstreetmap.org/search')
    url2.searchParams.set('street', street)
    url2.searchParams.set('city', cidade)
    url2.searchParams.set('country', 'Brazil')
    url2.searchParams.set('format', 'json')
    url2.searchParams.set('limit', '1')

    const coords2 = await fetchNominatim(url2.toString())
    if (coords2) return coords2
  }

  return null
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

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ processados: 0, erros: 0 })
  }

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

    const coords = await geocodificarEndereco(p.endereco, p.municipio)

    // Garantir 1 req/sec mesmo quando só uma tentativa foi feita
    await delay(1100)

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

  return NextResponse.json({ processados, erros })
}
