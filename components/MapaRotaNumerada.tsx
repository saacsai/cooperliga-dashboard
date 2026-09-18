'use client'
import { useEffect, useRef } from 'react'

interface PontoRota {
  ponto_id: string
  lat: number
  lng: number
  nome: string
}

interface Props {
  pontos: PontoRota[] // já na ordem de entrega da rota
}

// Mapa compacto por rota — marcador numerado (1, 2, 3...) na ordem de entrega
// atual + linha ligando os pontos na sequência, pra dar visualização
// espacial de verdade (não só pin solto). Reflete a ordem ao vivo — se o
// operador arrastar um ponto (roteirizacao/page.tsx), o mapa redesenha na
// nova ordem junto.
export default function MapaRotaNumerada({ pontos }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !pontos.length) return

    const el = containerRef.current
    let map: import('leaflet').Map | null = null

    import('leaflet').then(L => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const latC = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length
      const lngC = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length

      map = L.map(el).setView([latC, lngC], 13)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      L.polyline(pontos.map(p => [p.lat, p.lng]), {
        color: '#072740', weight: 2, opacity: 0.5, dashArray: '4,6',
      }).addTo(map)

      pontos.forEach((p, i) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#072740;color:#fff;width:22px;height:22px;border-radius:50%;
                              display:flex;align-items:center;justify-content:center;
                              font-size:11px;font-weight:700;border:2px solid #fff;
                              box-shadow:0 1px 3px rgba(0,0,0,0.4)">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })
        L.marker([p.lat, p.lng], { icon })
          .bindPopup(`<div style="font-size:12px"><strong>${i + 1}. ${p.nome}</strong></div>`)
          .addTo(map!)
      })

      if (pontos.length > 1) {
        map.fitBounds(pontos.map(p => [p.lat, p.lng] as [number, number]), { padding: [24, 24] })
      }
    })

    return () => { map?.remove() }
  }, [pontos])

  return (
    <div
      ref={containerRef}
      style={{ height: '240px', width: '100%', borderRadius: '8px', zIndex: 0 }}
    />
  )
}
