import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side (browser)
export function createBrowserSupabase() {
  return createBrowserClient(url, anon)
}

// Server-side (service role — apenas em route handlers)
export function createServiceSupabase() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Types
export type Perfil = 'admin' | 'gestor' | 'analista' | 'financeiro' | 'operador'

export interface Usuario {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  perfil: Perfil
  ativo: boolean
}

export interface Rota {
  id: string
  codigo: string
  nome: string
  regiao: string | null
  agregado_id: string | null
  valor_frete: number | null
  ativo: boolean
}

export interface Manifesto {
  id: string
  numero: string
  rota_id: string
  agregado_id: string | null
  regiao: string | null
  data_entrega_inicio: string | null
  data_entrega_fim: string | null
  data_receber: string | null
  status: 'programado' | 'carregando_parcial' | 'carregado' | 'entregue' | 'retorno_ok' | 'retorno_pendencia'
  caixas_enviadas: Record<string, number>
  caixas_esperadas_retorno: Record<string, number>
  caixas_retornadas: Record<string, number>
  numero_sequencial: number
  numero_whatsapp: string
  pdf_url: string | null
  created_at: string
}

export interface ManifestoItem {
  id: string
  manifesto_id: string
  ponto_de_entrega_id: string
  produto_id: string
  sequencia: number
  quantidade: number
  caixas_cheias: number | null
  unidades_avulsas: number | null
}

export interface PontoDeEntrega {
  id: string
  nome: string
  codigo_estado: string | null
  codigo_interno: string | null
  endereco: string | null
  municipio: string | null
  ativo: boolean
}

export interface Agregado {
  id: string
  nome: string
  cpf_cnpj: string | null
  chave_pix: string | null
  whatsapp: string | null
  veiculo_placa: string | null
  veiculo_tipo: string | null
  ativo: boolean
}
