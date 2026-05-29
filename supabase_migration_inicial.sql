-- CooperLiga — Migração inicial
-- Execute no Supabase SQL Editor do projeto CooperLiga

-- Sequence para numero_whatsapp dos manifestos (futuro)
CREATE SEQUENCE IF NOT EXISTS manifestos_seq START 1;

-- USUÁRIOS (vinculado a auth.users)
CREATE TABLE IF NOT EXISTS usuarios (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    whatsapp    TEXT,
    perfil      TEXT NOT NULL CHECK (perfil IN ('admin', 'gestor', 'analista', 'financeiro', 'operador')),
    ativo       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê o próprio registro
CREATE POLICY "usuario_le_proprio" ON usuarios
  FOR SELECT USING (auth.uid() = id);

-- Admin lê todos
CREATE POLICY "admin_le_todos" ON usuarios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'admin')
  );

-- Admin insere (via service role na API — esta policy é para consistência)
CREATE POLICY "admin_insere" ON usuarios
  FOR INSERT WITH CHECK (TRUE); -- service role bypassa RLS

-- Admin atualiza
CREATE POLICY "admin_atualiza" ON usuarios
  FOR UPDATE USING (TRUE); -- service role bypassa RLS

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────
-- INSTRUÇÃO PARA O PRIMEIRO ADMIN:
-- Após criar o projeto Supabase e rodar esta migration:
--
-- 1. Crie o usuário no Supabase Auth (Authentication > Users > Add user)
--    com email e senha do admin
--
-- 2. Copie o UUID gerado e execute:
--    INSERT INTO usuarios (id, nome, email, perfil)
--    VALUES ('<UUID_DO_AUTH>', 'Luciano Maeda', 'luciano@email.com', 'admin');
--
-- A partir daí, o admin cria todos os outros via /dashboard/admin/usuarios
-- ─────────────────────────────────────────────────
