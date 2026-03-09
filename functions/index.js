const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const resendApiKey = defineSecret("RESEND_API_KEY");

exports.sendInviteEmail = onRequest(
  {
    secrets: [resendApiKey],
    region: "southamerica-east1",
    cors: ["https://alexandresette.github.io"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { email } = req.body;
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "E-mail inválido." });
      return;
    }

    const appUrl = "https://alexandresette.github.io/planner-semanal/";

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite — Planner Semanal</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:500px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- HEADER com logo -->
        <tr>
          <td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #F1F5F9;">
            <img src="https://alexandresette.github.io/planner-semanal/logo-light.svg"
                 alt="Planner Semanal"
                 width="260"
                 style="display:block;margin:0 auto;max-width:260px;height:auto;" />
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 36px 8px;">
            <p style="margin:0 0 14px;font-size:16px;color:#1E293B;line-height:1.6;">
              Olá! Você recebeu um convite para acessar o <strong style="color:#5B5FBF;">Planner Semanal</strong>.
            </p>
            <p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.7;">
              Clique no botão abaixo para acessar o app. Na primeira vez, você poderá entrar com sua conta Google ou criar um usuário e senha.
            </p>

            <!-- BOTÃO -->
            <div style="text-align:center;padding:0 0 32px;">
              <a href="${appUrl}" style="display:inline-block;padding:14px 36px;background-color:#4F46E5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.2px;mso-padding-alt:0;line-height:1.4;">
                Acessar o Planner →
              </a>
            </div>

            <!-- CARD COMO ACESSAR -->
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:8px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#5B5FBF;text-transform:uppercase;letter-spacing:0.8px;">Como acessar</p>
              <p style="margin:0;font-size:13px;color:#475569;line-height:1.7;">
                <strong style="color:#1E293B;">Com Google:</strong> clique em "Entrar com Google" usando este e-mail.<br>
                <strong style="color:#1E293B;">Com senha:</strong> acesse o app e crie seu usuário no primeiro acesso.
              </p>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #F1F5F9;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94A3B8;">Desenvolvido por Alexandre Sette</p>
            <p style="margin:4px 0 0;font-size:10px;color:#CBD5E1;font-style:italic;">Colossenses 3:23-24</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const apiKey = resendApiKey.value();
      console.log("Sending to:", email, "API key length:", apiKey ? apiKey.length : 0);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Planner Semanal <noreply@plannersemanal.com>",
          to: [email],
          subject: "Você foi convidado para o Planner Semanal 📋",
          html: htmlBody,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Resend error:", response.status, JSON.stringify(result));
        res.status(500).json({ error: "Falha ao enviar e-mail.", details: result });
        return;
      }

      console.log("E-mail enviado com sucesso:", result.id);
      res.status(200).json({ success: true, id: result.id });

    } catch (e) {
      console.error("Unexpected error:", e.message, e.stack);
      res.status(500).json({ error: "Erro inesperado.", message: e.message });
    }
  }
);

exports.sendResetEmail = onRequest(
  {
    secrets: [resendApiKey],
    region: "southamerica-east1",
    cors: ["https://alexandresette.github.io"],
  },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
    const { email, resetUrl } = req.body;
    if (!email || !email.includes("@") || !resetUrl) { res.status(400).json({ error: "Parâmetros inválidos." }); return; }

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redefinição de senha — Planner Semanal</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:500px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr>
          <td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #F1F5F9;">
            <img src="https://alexandresette.github.io/planner-semanal/logo-light.svg" alt="Planner Semanal" width="260" style="display:block;margin:0 auto;max-width:260px;height:auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px 8px;">
            <p style="margin:0 0 14px;font-size:16px;color:#1E293B;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong style="color:#5B5FBF;">Planner Semanal</strong>.</p>
            <p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.7;">Clique no botão abaixo para criar uma nova senha. Este link expira em <strong style="color:#1E293B;">1 hora</strong>.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:0 0 32px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background-color:#4F46E5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.2px;line-height:1.4;">Redefinir minha senha →</a>
                </td>
              </tr>
            </table>
            <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px 20px;margin-bottom:8px;">
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanece a mesma.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #F1F5F9;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94A3B8;">Desenvolvido por Alexandre Sette</p>
            <p style="margin:4px 0 0;font-size:10px;color:#CBD5E1;font-style:italic;">Colossenses 3:23-24</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const apiKey = resendApiKey.value();
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Planner Semanal <noreply@plannersemanal.com>",
          to: [email],
          subject: "Redefinição de senha — Planner Semanal",
          html: htmlBody,
        }),
      });
      const result = await response.json();
      if (!response.ok) { res.status(500).json({ error: "Falha ao enviar e-mail.", details: result }); return; }
      res.status(200).json({ success: true, id: result.id });
    } catch (e) {
      res.status(500).json({ error: "Erro inesperado.", message: e.message });
    }
  }
);
