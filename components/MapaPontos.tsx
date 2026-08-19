'use client'
import { useEffect, useRef } from 'react'

interface PontoMapa {
  ponto_id: string
  lat: number
  lng: number
  nome: string
  codigo: string
  endereco: string
  qtde_caixas: number
}

interface Props {
  pontos: PontoMapa[]
  onRegeocodificar?: (pontoId: string) => void
  onEditarGeo?: (pontoId: string) => void
}

export default function MapaPontos({ pontos, onRegeocodificar, onEditarGeo }: Props) {
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

      map = L.map(el).setView([latC, lngC], 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const btnStyle = 'margin-top:6px;font-size:11px;padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;background:#f9fafb;color:#374151'

      pontos.forEach(p => {
        const popupHtml = `
          <div style="font-size:12px;min-width:180px">
            <strong>${p.nome}</strong><br>
            <span style="color:#666;font-size:11px">${p.endereco}</span><br>
            <span style="color:#072740;font-size:11px">${p.qtde_caixas} caixas</span><br>
            <span style="color:#999;font-size:10px">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
            <div style="display:flex;gap:6px;margin-top:6px;">
              ${onRegeocodificar ? `<button data-action="regeo" data-ponto-id="${p.ponto_id}" style="${btnStyle}">↺ Regeocodificar</button>` : ''}
              ${onEditarGeo    ? `<button data-action="editar" data-ponto-id="${p.ponto_id}" style="${btnStyle}">✎ Corrigir</button>` : ''}
            </div>
          </div>`

        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color: '#072740',
          fillColor: '#072740',
          fillOpacity: 0.75,
          weight: 1.5,
        }).bindPopup(popupHtml).addTo(map!)

        marker.on('popupopen', () => {
          setTimeout(() => {
            el.querySelector(`[data-action="regeo"][data-ponto-id="${p.ponto_id}"]`)
              ?.addEventListener('click', () => { onRegeocodificar?.(p.ponto_id); marker.closePopup() })
            el.querySelector(`[data-action="editar"][data-ponto-id="${p.ponto_id}"]`)
              ?.addEventListener('click', () => { onEditarGeo?.(p.ponto_id); marker.closePopup() })
          }, 50)
        })
      })
    })

    return () => { map?.remove() }
  }, [pontos, onRegeocodificar, onEditarGeo])

  return (
    <div
      ref={containerRef}
      style={{ height: '320px', width: '100%', borderRadius: '8px', zIndex: 0 }}
    />
  )
}
