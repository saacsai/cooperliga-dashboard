'use client'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface PontoMapa {
  lat: number
  lng: number
  nome: string
  codigo: string
  endereco: string
  qtde_caixas: number
}

export default function MapaPontos({ pontos }: { pontos: PontoMapa[] }) {
  if (!pontos.length) return null

  const latC = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length
  const lngC = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length

  return (
    <MapContainer
      center={[latC, lngC]}
      zoom={12}
      style={{ height: '320px', width: '100%', borderRadius: '8px', zIndex: 0 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pontos.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lng]}
          radius={7}
          pathOptions={{ color: '#5C0F0F', fillColor: '#5C0F0F', fillOpacity: 0.75, weight: 1.5 }}
        >
          <Popup>
            <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
              <strong>{p.nome}</strong><br />
              <span style={{ color: '#666' }}>{p.endereco}</span><br />
              <span style={{ color: '#5C0F0F' }}>{p.qtde_caixas} caixas</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
