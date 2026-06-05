-- Portal do Agregado: link permanente + OTP via WhatsApp + upload NF

-- 1. Link permanente por agregado (UUID imutável na URL)
ALTER TABLE agregados
  ADD COLUMN IF NOT EXISTS access_token UUID DEFAULT gen_random_uuid() UNIQUE;

UPDATE agregados SET access_token = gen_random_uuid() WHERE access_token IS NULL;

-- 2. Caminho do arquivo NF no Supabase Storage
ALTER TABLE pagamentos_agregados
  ADD COLUMN IF NOT EXISTS nf_arquivo TEXT;

-- 3. OTP codes (expiram em 10 min, uso único)
CREATE TABLE IF NOT EXISTS portal_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agregado_id UUID NOT NULL REFERENCES agregados(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Sessões (expiram em 30 dias)
CREATE TABLE IF NOT EXISTS portal_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agregado_id   UUID NOT NULL REFERENCES agregados(id) ON DELETE CASCADE,
  session_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS: somente service_role acessa essas tabelas
ALTER TABLE portal_otps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role portal_otps"
  ON portal_otps FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role portal_sessions"
  ON portal_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Storage bucket privado para NFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nfs-agregados', 'nfs-agregados', false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "service_role nfs-agregados"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'nfs-agregados')
  WITH CHECK (bucket_id = 'nfs-agregados');
