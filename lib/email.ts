import { Resend } from 'resend'

const FROM     = 'CooperLiga <sistema@cooperliga.saacs.com.br>'
const URL_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://cooperliga.saacs.com.br'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function enviarBoasVindas(opts: { nome: string; email: string; link: string }) {
  return getResend().emails.send({
    from: FROM,
    to:   opts.email,
    subject: 'Bem-vindo ao CooperLiga — defina sua senha',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5EFEF;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFEF;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Header -->
        <tr><td style="background:#5C0F0F;padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;color:#D4A0A0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Gestão Logística</p>
          <p style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">CooperLiga</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Olá, ${opts.nome.split(' ')[0]}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Seu acesso ao sistema CooperLiga foi criado. Clique no botão abaixo para definir sua senha e começar a usar.
          </p>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="${opts.link}" style="display:inline-block;background:#5C0F0F;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;">
                Definir minha senha →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Este link expira em <strong>1 hora</strong>. Se você não esperava este email, entre em contato com o administrador do sistema.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;font-size:11px;color:#d1d5db;">SAACS.AI — sistema gerado automaticamente, não responda este email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}

export async function enviarRecuperacaoSenha(opts: { nome: string; email: string; link: string }) {
  return getResend().emails.send({
    from: FROM,
    to:   opts.email,
    subject: 'Redefinir senha — CooperLiga',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5EFEF;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFEF;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Header -->
        <tr><td style="background:#5C0F0F;padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;color:#D4A0A0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Gestão Logística</p>
          <p style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">CooperLiga</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Redefinir senha</p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Olá, ${opts.nome.split(' ')[0]}! Recebemos uma solicitação para redefinir a senha da conta <strong>${opts.email}</strong>.
            Clique no botão abaixo para criar uma nova senha.
          </p>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="${opts.link}" style="display:inline-block;background:#5C0F0F;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:10px;">
                Criar nova senha →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este email — sua senha permanece inalterada.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;font-size:11px;color:#d1d5db;">SAACS.AI — sistema gerado automaticamente, não responda este email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}
