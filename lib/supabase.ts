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
export type TipoGR = 'estado' | 'municipal'
export type UnidadePadrao = 'UNIDADE' | 'CAIXA' | 'PACOTE'

export interface Usuario {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  perfil: Perfil
  ativo: boolean
  created_at: string
  cpf: string | null
  rg: string | null
  data_nascimento: string | null
  endereco: string | null
  municipio: string | null
  cep: string | null
  cargo: string | null
}

export interface Cliente {
  id: string
  nome: string
  tipo: 'cooperativa' | 'associacao' | 'oscip' | 'empresa_privada' | 'orgao_publico' | 'outro'
  cnpj: string | null
  codigo: string | null
  contato_nome: string | null
  contato_whatsapp: string | null
  razao_social: string | null
  endereco: string | null
  municipio: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  ativo: boolean
  created_at: string
}

export interface Contrato {
  id: string
  cliente_id: string
  orgao: string
  numero: string | null
  codigo: string | null
  tipo_gr: TipoGR | null
  descricao: string | null
  ativo: boolean
  created_at: string
  clientes?: { nome: string }
}

export interface PontoDeEntrega {
  id: string
  nome: string
  contrato_id: string | null
  codigo_interno: string | null
  codigo_estado: string | null
  codigo_prefeitura: string | null
  endereco: string | null
  municipio: string | null
  bairro: string | null
  cep: string | null
  contato_nome: string | null
  ativo: boolean
  created_at: string
  contratos?: { orgao: string; clientes: { nome: string } }
}

export interface Produto {
  id: string
  nome: string
  unidade_padrao: UnidadePadrao
  capacidade_por_caixa: number | null
  categoria: string | null
  ativo: boolean
  created_at: string
}

export interface Rota {
  id: string
  codigo: string
  nome: string
  regiao: string | null
  cep_referencia: string | null
  contrato_id: string | null
  agregado_id: string | null
  valor_frete: number | null
  ativo: boolean
  created_at: string
  agregados?: { nome: string }
  contratos?: { codigo: string | null; orgao: string }
}

export type TipoMovimento = 'recebimento' | 'distribuicao' | 'retorno' | 'retirada' | 'venda' | 'ajuste'

export interface EstoqueMovimento {
  id: string
  data: string
  tipo: TipoMovimento
  cliente_id: string | null
  agregado_id: string | null
  produto_id: string | null
  manifesto_id: string | null
  entrada: number
  saida: number
  observacao: string | null
  created_by: string | null
  created_at: string
  clientes?: { nome: string } | null
  agregados?: { nome: string } | null
  produtos?: { nome: string } | null
  ciclo_manifestos?: { numero: number; variante: string | null; rotas: { codigo: string } | null } | null
}

export interface Agregado {
  id: string
  nome: string
  cpf_cnpj: string | null
  chave_pix: string | null
  whatsapp: string | null
  veiculo_placa: string | null
  veiculo_tipo: string | null
  razao_social: string | null
  endereco: string | null
  municipio: string | null
  cep: string | null
  ativo: boolean
  created_at: string
  access_token: string | null
}
