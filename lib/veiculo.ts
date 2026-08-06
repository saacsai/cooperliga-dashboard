export const CAPACIDADE_VEICULO: Record<string, { min: number; max: number; max_entregas: number }> = {
  fiorino: { min: 25, max: 30,  max_entregas: 25 },
  kombi:   { min: 40, max: 50,  max_entregas: 30 },
  hr:      { min: 60, max: 70,  max_entregas: 35 },
  iveco:   { min: 90, max: 100, max_entregas: 40 },
  '3_4':   { min: 120, max: 130, max_entregas: 45 },
}
