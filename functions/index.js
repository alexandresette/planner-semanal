const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const resendApiKey = defineSecret("RESEND_API_KEY");

const ALLOWED_ORIGINS = [
  "https://plannersemanal.com",
  "https://www.plannersemanal.com",
  "https://alexandresette.github.io",
  "http://localhost:4173",
  "http://localhost:5173",
];
const OPTS = { region: "southamerica-east1", cors: ALLOWED_ORIGINS };
const MAIL_OPTS = { ...OPTS, secrets: [resendApiKey] };

const APP_URL = "https://plannersemanal.com";
const LOGO_URL = "https://plannersemanal.com/logo-light.svg";
const ADMIN_USER = "xande";
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

/* ─── Helpers de dados (coleção storage, valor em JSON string) ─── */
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const normEmail = (e) => String(e || "").toLowerCase().trim();

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function readKey(key) {
  const snap = await db.collection("storage").doc(key).get();
  if (!snap.exists) return null;
  try { return JSON.parse(snap.data().value); } catch { return null; }
}

async function writeKey(key, obj) {
  await db.collection("storage").doc(key).set({ value: JSON.stringify(obj), updatedAt: new Date().toISOString() });
}

async function deleteKey(key) {
  await db.collection("storage").doc(key).delete();
}

async function allCreds() {
  const snap = await db.collection("storage")
    .where(FieldPath.documentId(), ">=", "user-creds-")
    .where(FieldPath.documentId(), "<", "user-creds-")
    .get();
  const list = [];
  snap.forEach((d) => { try { list.push(JSON.parse(d.data().value)); } catch {} });
  return list;
}

async function findUserByEmail(email) {
  const em = normEmail(email);
  return (await allCreds()).find((c) => normEmail(c.email) === em) || null;
}

async function findUser(login) {
  const l = normEmail(login);
  if (!l) return null;
  if (l.includes("@")) return findUserByEmail(l);
  return readKey(`user-creds-${l.replace(/[^a-z0-9]/g, "")}`);
}

async function isInvited(email) {
  const em = normEmail(email);
  const invites = (await readKey("admin-invites")) || [];
  return invites.some((i) => normEmail(i.email) === em);
}

async function uniqueUsername(email) {
  const base = normEmail(email).split("@")[0].replace(/[^a-z0-9]/g, "") || "usuario";
  let u = base, n = 1;
  while (u === ADMIN_USER || (await readKey(`user-creds-${u}`))) u = `${base}${n++}`;
  return u;
}

async function issueToken(username) {
  return getAuth().createCustomToken(username, { admin: username === ADMIN_USER });
}

function requireAdmin(req) {
  if (!req.auth || req.auth.token.admin !== true) throw new HttpsError("permission-denied", "Acesso restrito ao administrador.");
}

/* ─── Trava de tentativas de login (por usuário ou por e-mail desconhecido) ─── */
async function checkLock(id) {
  const att = (await readKey(`login-attempts-${id}`)) || { count: 0, until: 0 };
  if (att.until > Date.now()) throw new HttpsError("resource-exhausted", "Muitas tentativas. Tente de novo em 15 minutos.");
  return att;
}
async function registerFailure(id, att) {
  const count = (att.count || 0) + 1;
  await writeKey(`login-attempts-${id}`, count >= MAX_ATTEMPTS ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 });
}

/* ─── E-mail (Resend) ─── */
async function sendMail(to, subject, html) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Planner Semanal <noreply@plannersemanal.com>", to: [to], subject, html }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    console.error("Resend falhou", response.status, details);
    throw new HttpsError("internal", "Falha ao enviar e-mail.");
  }
}

function inviteHtml(appUrl) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Convite — Planner Semanal</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px;"><tr><td align="center"><table width="100%" style="max-width:500px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);"><tr><td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #F1F5F9;"><img src="${LOGO_URL}" alt="Planner Semanal" width="260" style="display:block;margin:0 auto;max-width:260px;height:auto;" /></td></tr><tr><td style="padding:32px 36px 8px;"><h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1E293B;">Você foi convidado para o Planner Semanal</h2><p style="margin:0 0 14px;font-size:15px;color:#475569;line-height:1.7;">Olá! Você recebeu um convite para acessar o <strong style="color:#5B5FBF;">Planner Semanal</strong>.</p><p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.7;">Clique no botão abaixo para criar sua conta:</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px;"><a href="${appUrl}" style="display:inline-block;padding:14px 36px;background-color:#4F46E5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">Aceitar convite →</a></td></tr></table><div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;margin-bottom:8px;"><p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Ou copie o link:</p><p style="margin:0;font-size:12px;color:#6366F1;word-break:break-all;font-family:monospace;">${appUrl}</p></div></td></tr><tr><td style="padding:20px 36px 28px;border-top:1px solid #F1F5F9;text-align:center;"><p style="margin:0;font-size:11px;color:#94A3B8;">Desenvolvido por Alexandre Sette</p><p style="margin:4px 0 0;font-size:10px;color:#CBD5E1;font-style:italic;">Colossenses 3:23-24</p></td></tr></table></td></tr></table></body></html>`;
}

function resetHtml(safeResetUrl) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redefinição de senha | Planner Semanal</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 16px;"><tr><td align="center"><table width="100%" style="max-width:500px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);"><tr><td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #F1F5F9;"><img src="${LOGO_URL}" alt="Planner Semanal" width="260" style="display:block;margin:0 auto;max-width:260px;height:auto;" /></td></tr><tr><td style="padding:32px 36px 8px;"><p style="margin:0 0 14px;font-size:16px;color:#1E293B;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong style="color:#5B5FBF;">Planner Semanal</strong>.</p><p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.7;">Clique no botão abaixo para criar uma nova senha. Este link expira em <strong style="color:#1E293B;">1 hora</strong>.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px;"><a href="${safeResetUrl}" style="display:inline-block;padding:14px 36px;background-color:#4F46E5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">Redefinir minha senha →</a></td></tr></table><div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px 20px;margin-bottom:8px;"><p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">Se você não solicitou a redefinição, ignore este e-mail.</p></div></td></tr><tr><td style="padding:20px 36px 28px;border-top:1px solid #F1F5F9;text-align:center;"><p style="margin:0;font-size:11px;color:#94A3B8;">Desenvolvido por Alexandre Sette</p><p style="margin:4px 0 0;font-size:10px;color:#CBD5E1;font-style:italic;">Colossenses 3:23-24</p></td></tr></table></td></tr></table></body></html>`;
}

/* ─── login: e-mail (ou usuário) + senha ─── */
exports.login = onCall(OPTS, async (req) => {
  const { login, password } = req.data || {};
  if (!login || !password) throw new HttpsError("invalid-argument", "Informe e-mail e senha.");
  const user = await findUser(login);
  const lockId = user ? user.username : `x${sha256(normEmail(login)).slice(0, 16)}`;
  const att = await checkLock(lockId);
  const ok = user && user.hash && safeEqual(sha256(`${user.username}:${password}`), user.hash);
  if (!ok) {
    await registerFailure(lockId, att);
    throw new HttpsError("permission-denied", "E-mail ou senha incorretos.");
  }
  if (att.count) await deleteKey(`login-attempts-${lockId}`).catch(() => {});
  return { username: user.username, token: await issueToken(user.username) };
});

/* ─── loginGoogle: o cliente entra com Google e chama esta função com o ID token ─── */
exports.loginGoogle = onCall(OPTS, async (req) => {
  const t = req.auth && req.auth.token;
  if (!t || !t.firebase || t.firebase.sign_in_provider !== "google.com" || !t.email || t.email_verified === false) {
    throw new HttpsError("unauthenticated", "Entre com uma conta Google.");
  }
  const email = normEmail(t.email);
  let user = await findUserByEmail(email);
  let created = false;
  if (!user) {
    if (!(await isInvited(email))) throw new HttpsError("permission-denied", "Este e-mail não está autorizado. Solicite um convite ao administrador.");
    const username = await uniqueUsername(email);
    user = { username, hash: "", email };
    await writeKey(`user-creds-${username}`, user);
    if (!(await readKey(`planner-${username}-profile`))) {
      await writeKey(`planner-${username}-profile`, { displayName: t.name || email.split("@")[0], photoURL: t.picture || "" });
    }
    created = true;
  }
  return { username: user.username, token: await issueToken(user.username), created };
});

/* ─── inviteStatus: usado na tela do link de convite ─── */
exports.inviteStatus = onCall(OPTS, async (req) => {
  const email = normEmail(req.data && req.data.email);
  if (!email.includes("@")) return { status: "invalid" };
  if (await findUserByEmail(email)) return { status: "registered" };
  return { status: (await isInvited(email)) ? "valid" : "invalid" };
});

/* ─── register: cadastro com senha a partir de um convite ─── */
exports.register = onCall(OPTS, async (req) => {
  const { email, displayName, password } = req.data || {};
  const em = normEmail(email);
  const name = String(displayName || "").trim();
  if (name.length < 2) throw new HttpsError("invalid-argument", "Digite seu nome.");
  if (String(password || "").length < 4) throw new HttpsError("invalid-argument", "A senha precisa ter pelo menos 4 caracteres.");
  if (!(await isInvited(em))) throw new HttpsError("permission-denied", "Este e-mail não possui um convite ativo.");
  if (await findUserByEmail(em)) throw new HttpsError("already-exists", "Esta conta já foi criada.");
  const username = await uniqueUsername(em);
  await writeKey(`user-creds-${username}`, { username, hash: sha256(`${username}:${password}`), email: em });
  await writeKey(`planner-${username}-profile`, { displayName: name, photoURL: "" });
  return { username, token: await issueToken(username) };
});

/* ─── requestPasswordReset: cria o token e envia o e-mail ─── */
exports.requestPasswordReset = onCall(MAIL_OPTS, async (req) => {
  const em = normEmail(req.data && req.data.email);
  if (!em.includes("@")) throw new HttpsError("invalid-argument", "Digite um e-mail válido.");
  const user = await findUserByEmail(em);
  if (!user) throw new HttpsError("not-found", "Nenhuma conta encontrada com este e-mail.");
  const token = crypto.randomBytes(24).toString("hex");
  await writeKey(`reset-token-${token}`, { username: user.username, email: em, expiresAt: Date.now() + 60 * 60 * 1000 });
  const safeResetUrl = `${APP_URL}/?reset=${token}`;
  await sendMail(em, "Redefinição de senha | Planner Semanal", resetHtml(safeResetUrl));
  return { ok: true };
});

/* ─── resetPassword: sem senha valida o link; com senha troca a senha ─── */
exports.resetPassword = onCall(OPTS, async (req) => {
  const { token, password } = req.data || {};
  if (!token || !/^[a-f0-9]{16,128}$/.test(token)) throw new HttpsError("invalid-argument", "Link inválido ou expirado.");
  const data = await readKey(`reset-token-${token}`);
  if (!data || Date.now() > data.expiresAt) throw new HttpsError("not-found", "Este link expirou. Solicite um novo reset de senha.");
  if (password === undefined) return { username: data.username };
  if (String(password).length < 4) throw new HttpsError("invalid-argument", "A senha precisa ter pelo menos 4 caracteres.");
  const u = data.username;
  const creds = (await readKey(`user-creds-${u}`)) || { username: u, email: data.email || "" };
  await writeKey(`user-creds-${u}`, { ...creds, hash: sha256(`${u}:${password}`) });
  await deleteKey(`reset-token-${token}`);
  await deleteKey(`login-attempts-${u}`).catch(() => {});
  return { ok: true };
});

/* ─── sendInvite: só admin; registra o convite e envia o e-mail ─── */
exports.sendInvite = onCall(MAIL_OPTS, async (req) => {
  requireAdmin(req);
  const em = normEmail(req.data && req.data.email);
  if (!em.includes("@")) throw new HttpsError("invalid-argument", "E-mail inválido.");
  const invites = (await readKey("admin-invites")) || [];
  if (!invites.some((i) => normEmail(i.email) === em)) {
    invites.push({ email: em, createdAt: new Date().toISOString() });
    await writeKey("admin-invites", invites);
  }
  await sendMail(em, "Você foi convidado para o Planner Semanal", inviteHtml(`${APP_URL}/?invite=${encodeURIComponent(em)}`));
  return { invites };
});
