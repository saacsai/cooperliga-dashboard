import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function getSupabase() {
  return createClient(url, anon)
}

export function getSupabaseAdmin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type Perfil = 'admin' | 'gestor' | 'analista' | 'financeiro' | 'operador'

export interface Usuario {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  perfil: Perfil
  ativo: boolean
  created_at: string
}
