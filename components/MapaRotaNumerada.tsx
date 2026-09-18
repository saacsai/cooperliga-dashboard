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
// atual + linha ligando os pontos na sequência.
//
// O mapa Leaflet é montado UMA ÚNICA VEZ (effect com deps []); quando a
// ordem dos pontos muda (arrastar), só a camada de marcadores/linha é
// trocada em cima do mapa já existente — nunca recriamos o `L.map()`.
// Isso evita uma corrida real que existia antes: como o array de pontos
// muda de referência a cada re-render (inclusive durante o próprio gesto de
// arrastar), recriar o mapa inteiro a cada mudança causava duas
// inicializações do Leaflet quase simultâneas no mesmo container — a
// segunda falhava silenciosamente ("Map container is already
// initialized"), deixando uma versão congelada na tela até desmontar/
// remontar o componente (fechar e abrir o "Ver mapa" de novo).
export default function MapaRotaNumerada({ pontos }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<import('leaflet').Map | null>(null)
  const leafletRef      = useRef<typeof import('leaflet') | null>(null)
  const layerGroupRef   = useRef<import('leaflet').LayerGroup | null>(null)
  const pontosRef       = useRef<PontoRota[]>(pontos)
  pontosRef.current = pontos

  function desenharCamada() {
    const L   = leafletRef.current
    const map = mapRef.current
    const pts = pontosRef.current
    if (!L || !map || !pts.length) return

    layerGroupRef.current?.remove()
    const grupo = L.layerGroup()

    L.polyline(pts.map(p => [p.lat, p.lng]), {
      color: '#072740', weight: 2, opacity: 0.5, dashArray: '4,6',
    }).addTo(grupo)

    pts.forEach((p, i) => {
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
        .addTo(grupo)
    })

    grupo.addTo(map)
    layerGroupRef.current = grupo

    if (pts.length > 1) {
      map.fitBounds(pts.map(p => [p.lat, p.lng] as [number, number]), { padding: [24, 24] })
    } else {
      map.setView([pts[0].lat, pts[0].lng], 14)
    }
  }

  // Monta o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelado = false

    import('leaflet').then(L => {
      if (cancelado || !containerRef.current || mapRef.current) return
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }
      const map = L.map(containerRef.current).setView([0, 0], 2)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      leafletRef.current = L
      mapRef.current = map
      desenharCamada()
    })

    return () => {
      cancelado = true
      mapRef.current?.remove()
      mapRef.current = null
      leafletRef.current = null
      layerGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redesenha só a camada (marcadores + linha) quando a ordem/pontos mudar.
  useEffect(() => {
    desenharCamada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontos])

  return (
    <div
      ref={containerRef}
      style={{ height: '260px', width: '100%', borderRadius: '8px', zIndex: 0 }}
    />
  )
}
