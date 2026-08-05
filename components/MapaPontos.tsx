'use client'
import { useEffect, useRef } from 'react'

interface PontoMapa {
  lat: number
  lng: number
  nome: string
  codigo: string
  endereco: string
  qtde_caixas: number
}

export default function MapaPontos({ pontos }: { pontos: PontoMapa[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !pontos.length) return

    const el = containerRef.current

    // Leaflet requer window, importar dinamicamente
    let map: import('leaflet').Map | null = null
    import('leaflet').then(L => {
      // Injetar CSS do Leaflet uma única vez
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const latC = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length
      const lngC = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length

      map = L.map(el).setView([latC, lngC], 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      pontos.forEach(p => {
        L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color: '#5C0F0F',
          fillColor: '#5C0F0F',
          fillOpacity: 0.75,
          weight: 1.5,
        })
          .bindPopup(`<strong style="font-size:12px">${p.nome}</strong><br>
            <span style="font-size:11px;color:#666">${p.endereco}</span><br>
            <span style="font-size:11px;color:#5C0F0F">${p.qtde_caixas} caixas</span>`)
          .addTo(map!)
      })
    })

    return () => {
      map?.remove()
    }
  }, [pontos])

  return (
    <div
      ref={containerRef}
      style={{ height: '320px', width: '100%', borderRadius: '8px', zIndex: 0 }}
    />
  )
}
