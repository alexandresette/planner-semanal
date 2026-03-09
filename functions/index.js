const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const resendApiKey = defineSecret("RESEND_API_KEY");

exports.sendInviteEmail = onRequest(
  { secrets: [resendApiKey], region: "southamerica-east1", cors: ["https://alexandresette.github.io"] },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { email } = req.body;
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "E-mail inválido." }); return;
    }

    const appUrl = "https://alexandresette.github.io/planner-semanal/";

    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite — Planner Semanal</title>
</head>
<body style="margin:0;padding:0;background:#0B1120;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(139,92,246,0.15));padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:28px;margin-bottom:8px;">📋</div>
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#F1F5F9;letter-spacing:-0.5px;">Planner Semanal</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#64748B;">Organize sua semana, avance com velocidade.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.6;">
                Você recebeu um convite para acessar o <strong style="color:#F1F5F9;">Planner Semanal</strong>!
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6;">
                Clique no botão abaixo para acessar o app. Na primeira vez, você poderá entrar com sua conta Google ou criar um usuário e senha.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <a href="${appUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#3B82F6,#8B5CF6);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.2px;">
                      Acessar o Planner →
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.15);border-radius:12px;padding:16px 18px;margin-bottom:8px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#60A5FA;text-transform:uppercase;letter-spacing:0.5px;">Como acessar</p>
                <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                  <strong style="color:#CBD5E1;">Com Google:</strong> clique em "Entrar com Google" usando este e-mail.<br>
                  <strong style="color:#CBD5E1;">Com senha:</strong> clique em "Entrar com Google", o app vai pedir para você criar um usuário e senha no primeiro acesso.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
              <p style="margin:0;font-size:11px;color:#475569;">Desenvolvido por Alexandre Sette</p>
              <p style="margin:4px 0 0;font-size:10px;color:#334155;font-style:italic;">Colossenses 3:23-24</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Planner Semanal <noreply@plannersemanal.com>",
          to: [email],
          subject: "Você foi convidado para o Planner Semanal 📋",
          html: htmlBody,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("Resend error:", err);
        res.status(500).json({ error: "Falha ao enviar e-mail." }); return;
      }

      const result = await response.json();
      console.log("E-mail enviado:", result.id);
      res.status(200).json({ success: true, id: result.id });

    } catch (e) {
      console.error("Unexpected error:", e);
      res.status(500).json({ error: "Erro inesperado." });
    }
  }
);
