import React, { useState, useEffect, useCallback, useRef } from "react";
import { signInWithGoogle, firebaseSignOut, auth, callSendInviteEmail, callSendResetEmail } from "./storage.js";

const LOGO_DARK = `${import.meta.env.BASE_URL}logo.svg`;
const LOGO_LIGHT = `${import.meta.env.BASE_URL}logo-light.svg`;

const AUTH_KEY = "gestor-auth";
const USER_KEY = "gestor-user";
const SESSION_TOKEN_KEY = "gestor-session-token";

const CREDENTIALS = {
  "xande": "df0a720d14ebe80f38b75efe20f84c740e176e3eca65183ddaf75999510c08e3",
};

// Mapeamento fixo de Gmail → usuário (hardcoded, não exposto na UI)
const GMAIL_MAP = {
  "alexandresettesf@gmail.com": "xande",
};

const ADMIN_USER = "xande";
const ADMIN_INVITES_KEY = "admin-invites";
const USER_CREDS_PREFIX = "user-creds-";

// Normaliza email para chave de storage (sem caracteres especiais)
function emailToKey(email) { return email.toLowerCase().replace(/[^a-z0-9]/g, "_"); }
function googleUserKey(email) { return `google_${emailToKey(email)}`; }

async function loadInvites() {
  try { const r = await window.storage.get(ADMIN_INVITES_KEY); return r && r.value ? JSON.parse(r.value) : []; } catch { return []; }
}
async function saveInvites(list) {
  await window.storage.set(ADMIN_INVITES_KEY, JSON.stringify(list));
}
async function loadDynamicCreds() {
  try {
    const keys = await window.storage.list(USER_CREDS_PREFIX);
    const creds = {};
    for (const k of (keys.keys || [])) {
      const r = await window.storage.get(k); if (r && r.value) { const d = JSON.parse(r.value); creds[d.username] = { hash: d.hash, email: d.email }; }
    }
    return creds;
  } catch { return {}; }
}
async function saveDynamicCred(username, hash, email) {
  await window.storage.set(`${USER_CREDS_PREFIX}${username}`, JSON.stringify({ username, hash, email }));
}
async function isEmailInvited(email) {
  const list = await loadInvites(); return list.some(i => i.email.toLowerCase() === email.toLowerCase());
}
async function isEmailRegistered(email) {
  try {
    const keys = await window.storage.list(USER_CREDS_PREFIX);
    for (const k of (keys.keys || [])) {
      const r = await window.storage.get(k); if (r && r.value) { const d = JSON.parse(r.value); if (d.email && d.email.toLowerCase() === email.toLowerCase()) return true; }
    }
    return false;
  } catch { return false; }
}
async function getUsernameByEmail(email) {
  const em = email.toLowerCase().trim();
  // Primeiro: checar GMAIL_MAP (usuários hardcoded)
  if (GMAIL_MAP[em]) return GMAIL_MAP[em];
  // Depois: buscar no Firestore (usuários dinâmicos)
  try {
    const keys = await window.storage.list(USER_CREDS_PREFIX);
    for (const k of (keys.keys || [])) {
      const r = await window.storage.get(k); if (r && r.value) { const d = JSON.parse(r.value); if (d.email && d.email.toLowerCase() === em) return d.username; }
    }
    return null;
  } catch { return null; }
}

async function hashStr(input) {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function verifyCredentials(user, pin) {
  const u = user.toLowerCase().trim();
  // Checar credenciais dinâmicas no Firestore — busca exata primeiro
  try {
    const r = await window.storage.get(`${USER_CREDS_PREFIX}${u}`);
    if (r && r.value) {
      const d = JSON.parse(r.value);
      if (d.hash) {
        const computed = await hashStr(`${u}:${pin}`);
        return computed === d.hash;
      }
    } else {
 }
  } catch (e) {
 }
  // Busca ampla
  try {
    const keys = await window.storage.list(USER_CREDS_PREFIX);
    for (const k of (keys.keys || [])) {
      const r = await window.storage.get(k).catch(() => null);
      if (r && r.value) {
        const d = JSON.parse(r.value);
        if (d.username && d.username.toLowerCase().trim() === u && d.hash) {
          const computed = await hashStr(`${u}:${pin}`);
          return computed === d.hash;
        }
      }
    }
  } catch (e) {
 }
  // Fallback hardcoded
  if (CREDENTIALS[u]) {
    const computed = await hashStr(`${u}:${pin}`);
    return computed === CREDENTIALS[u];
  }
  return false;
}

function userDataKey(user) { return `gestor-${user}-data`; }
function userHistoryKey(user) { return `gestor-${user}-history`; }

function getSunday(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0,0,0,0); return r; }
function getSaturday(d) { const r = getSunday(d); r.setDate(r.getDate()+6); return r; }
function fmtWeekLabel(sun, sat) {
  const d1 = String(sun.getDate()).padStart(2,"0");
  const d2 = String(sat.getDate()).padStart(2,"0");
  const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${d1} a ${d2} | ${MONTHS_FULL[sun.getMonth()]}/${sun.getFullYear()}`;
}
function weekId(sun) { return sun.toISOString().slice(0,10); }
function addWeeks(d, n) { const r = new Date(d); r.setDate(r.getDate()+7*n); return r; }

const WEEK_DAYS_ORDER = ["dom","seg","ter","qua","qui","sex","sab"];
const WEEK_DAYS = [
  {key:"dom",label:"Dom",full:"Domingo"},
  {key:"seg",label:"Seg",full:"Segunda"},
  {key:"ter",label:"Ter",full:"Terça"},
  {key:"qua",label:"Qua",full:"Quarta"},
  {key:"qui",label:"Qui",full:"Quinta"},
  {key:"sex",label:"Sex",full:"Sexta"},
  {key:"sab",label:"Sáb",full:"Sábado"},
];

const COLOR_OPTIONS = ["#EF4444","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];

// DEFAULT_PROJECTS só para o usuário xande
const DEFAULT_PROJECTS_XANDE = [
  { id:"dexan", name:"Dexan Commerce", emoji:"📦", color:"#F59E0B", tasks:[
    {id:"d1",text:"Resolver viabilidade CNPJ na Prefeitura",done:false,priority:"high",day:"seg"},
    {id:"d2",text:"Continuar processo Redesim após aprovação",done:false,priority:"high",day:"ter"},
    {id:"d3",text:"Pesquisar 3 produtos potenciais no ML",done:false,priority:"medium",day:"qua"},
    {id:"d4",text:"Terminar de assistir o curso do Método ELE",done:false,priority:"medium",day:"qui"},
  ]},
  { id:"ministerio", name:"Ministério Follow Lagoinha", emoji:"⛪", color:"#8B5CF6", tasks:[
    {id:"m1",text:"Acompanhar escala da semana (Site Visual)",done:false,priority:"high",day:"seg"},
    {id:"m2",text:"Criar app de cronômetro / programação para o culto",done:false,priority:"high",day:"sex"},
  ]},
  { id:"gc", name:"Estudos GCs", emoji:"📖", color:"#10B981", tasks:[
    {id:"g1",text:"Revisar conteúdo para o GC e apresentação",done:false,priority:"high",day:"qui"},
    {id:"g2",text:"Dia de GC",done:false,priority:"high",day:"qui"},
  ]},
  { id:"teologia", name:"Faculdade de Teologia", emoji:"🎓", color:"#3B82F6", tasks:[
    {id:"t1",text:"Responder fórum avaliativo 1 — Homilética",done:false,priority:"high",day:"seg"},
    {id:"t2",text:"Assistir aula 1 de Missiologia",done:false,priority:"medium",day:"ter"},
    {id:"t3",text:"Verificar novos materiais p/ plataforma Vamos Estudar",done:false,priority:"low",day:"qua"},
  ]},
  { id:"extras", name:"Extras", emoji:"⚡", color:"#EF4444", tasks:[
    {id:"f1",text:"Pagamento mensal das contas da casa",done:false,priority:"high",day:"seg"},
  ]},
];

function getDefaultProjects(user) {
  if (user === "xande") return DEFAULT_PROJECTS_XANDE;
  return []; // outros usuários começam zerados
}

const priorityConfig = {
  high:{label:"Alta",dot:"#EF4444",bg:"rgba(239,68,68,0.12)"},
  medium:{label:"Média",dot:"#F59E0B",bg:"rgba(245,158,11,0.12)"},
  low:{label:"Baixa",dot:"#6B7280",bg:"rgba(107,114,128,0.12)"},
};
const F = "'DM Sans', sans-serif";
const FS = "'Inter', sans-serif";

const themes = {
  dark: {
    bg: "#0B1120", cardBg: "rgba(255,255,255,0.04)", cardBorder: "rgba(255,255,255,0.07)",
    taskBg: "rgba(255,255,255,0.05)", taskBgDone: "rgba(255,255,255,0.02)", taskBorder: "rgba(255,255,255,0.08)", taskBorderDone: "rgba(255,255,255,0.03)",
    text: "#F1F5F9", textSub: "#94A3B8", textMuted: "#64748B", textDim: "#475569",
    inputBg: "rgba(255,255,255,0.06)", inputBorder: "rgba(255,255,255,0.1)", inputText: "#E2E8F0",
    weekBg: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(139,92,246,0.08))",
    weekNextBg: "linear-gradient(135deg,rgba(88,28,196,0.15),rgba(55,15,120,0.15))",
    progressBg: "linear-gradient(135deg,rgba(59,130,246,0.12),rgba(139,92,246,0.12))",
    progressNextBg: "linear-gradient(135deg,rgba(88,28,196,0.18),rgba(55,15,120,0.18))",
    hoverShadow: "rgba(255,255,255,0.06)", hoverBorder: "rgba(255,255,255,0.15)",
    logo: LOGO_DARK, loginCardBg: "rgba(255,255,255,0.03)", loginCardBorder: "rgba(255,255,255,0.07)",
    btnBg: "rgba(255,255,255,0.04)", btnBorder: "rgba(255,255,255,0.08)", modalBg: "#0F1729",
    divider: "rgba(255,255,255,0.05)",
    weekTabActive0: "rgba(59,130,246,0.2)", weekTabActive1: "rgba(88,28,196,0.3)",
    weekTabInactive: "rgba(255,255,255,0.04)", weekTabColor0: "#60A5FA", weekTabColor1: "#B388FF", weekTabColorInactive: "#64748B",
    addTaskBorder: "rgba(255,255,255,0.1)", addTaskColor: "#64748B",
    addCatBorder: "rgba(255,255,255,0.08)", addCatColor: "#64748B",
    reorderBorder: "rgba(255,255,255,0.1)",
    historyIconBg: "rgba(16,185,129,0.12)", historyIconColor: "#6EE7B7",
    tagBg: "rgba(255,255,255,0.07)", tagColor: "#94A3B8",
    cancelBg: "transparent", cancelBorder: "rgba(255,255,255,0.08)", cancelColor: "#64748B",
    progressRingBg: "rgba(255,255,255,0.08)",
    viewToggleBg: "rgba(255,255,255,0.04)", viewToggleBorder: "rgba(255,255,255,0.07)",
    colDayBg: "rgba(255,255,255,0.04)", colDayBorder: "rgba(255,255,255,0.07)", colDayDivider: "rgba(255,255,255,0.05)",
    dragOverBg: "rgba(59,130,246,0.12)", dragOverBorder: "rgba(59,130,246,0.4)", legendColor: "#64748B",
    deleteDangerBg: "rgba(239,68,68,0.1)", deleteDangerBorder: "rgba(239,68,68,0.3)",
  },
  light: {
    bg: "#F0F2F5", cardBg: "#FFFFFF", cardBorder: "rgba(0,0,0,0.08)",
    taskBg: "#F8F9FB", taskBgDone: "#ECEEF1", taskBorder: "rgba(0,0,0,0.08)", taskBorderDone: "rgba(0,0,0,0.04)",
    text: "#1E293B", textSub: "#475569", textMuted: "#64748B", textDim: "#94A3B8",
    inputBg: "#FFFFFF", inputBorder: "rgba(0,0,0,0.15)", inputText: "#1E293B",
    weekBg: "linear-gradient(135deg,rgba(59,130,246,0.06),rgba(139,92,246,0.06))",
    weekNextBg: "linear-gradient(135deg,rgba(88,28,196,0.08),rgba(55,15,120,0.08))",
    progressBg: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(139,92,246,0.08))",
    progressNextBg: "linear-gradient(135deg,rgba(88,28,196,0.1),rgba(55,15,120,0.1))",
    hoverShadow: "rgba(0,0,0,0.08)", hoverBorder: "rgba(0,0,0,0.14)",
    logo: LOGO_LIGHT, loginCardBg: "#FFFFFF", loginCardBorder: "rgba(0,0,0,0.1)",
    btnBg: "#ECEEF1", btnBorder: "rgba(0,0,0,0.1)", modalBg: "#FFFFFF",
    divider: "rgba(0,0,0,0.06)",
    weekTabActive0: "rgba(59,130,246,0.15)", weekTabActive1: "rgba(88,28,196,0.12)",
    weekTabInactive: "rgba(0,0,0,0.04)", weekTabColor0: "#2563EB", weekTabColor1: "#7C3AED", weekTabColorInactive: "#64748B",
    addTaskBorder: "rgba(0,0,0,0.12)", addTaskColor: "#64748B",
    addCatBorder: "rgba(0,0,0,0.1)", addCatColor: "#64748B",
    reorderBorder: "rgba(0,0,0,0.1)",
    historyIconBg: "rgba(16,185,129,0.1)", historyIconColor: "#059669",
    tagBg: "rgba(0,0,0,0.06)", tagColor: "#475569",
    cancelBg: "#F0F2F5", cancelBorder: "rgba(0,0,0,0.1)", cancelColor: "#475569",
    progressRingBg: "rgba(0,0,0,0.08)",
    viewToggleBg: "#ECEEF1", viewToggleBorder: "rgba(0,0,0,0.08)",
    colDayBg: "#FFFFFF", colDayBorder: "rgba(0,0,0,0.08)", colDayDivider: "rgba(0,0,0,0.06)",
    dragOverBg: "rgba(59,130,246,0.08)", dragOverBorder: "rgba(59,130,246,0.35)", legendColor: "#64748B",
    deleteDangerBg: "rgba(239,68,68,0.08)", deleteDangerBorder: "rgba(239,68,68,0.25)",
  }
};

function useTheme() {
  const [t,setT]=useState(()=>{try{return localStorage.getItem("planner-theme")||"dark";}catch{return "dark";}});
  const toggle=()=>{const n=t==="dark"?"light":"dark";setT(n);try{localStorage.setItem("planner-theme",n);}catch{}};
  return {mode:t,toggle,t:themes[t]};
}

function Logo({ size = "normal", theme }) {
  // Se não receber tema, lê do localStorage — garante a logo certa em qualquer tela
  const resolvedTheme = theme || (typeof localStorage !== "undefined" ? localStorage.getItem("planner-theme") || "dark" : "dark");
  const src = resolvedTheme === "light" ? LOGO_LIGHT : LOGO_DARK;
  return <img src={src} alt="Planner Semanal" style={{ width: size === "normal" ? 180 : 200, display: "block", marginLeft: size === "large" ? "auto" : undefined, marginRight: size === "large" ? "auto" : undefined }} />;
}

/* ─── First Access Screen (cadastro de novo usuário convidado) ─── */
/* ─── Invite Gate: valida e-mail no Firestore antes de mostrar cadastro ─── */
/* ─── Tela de convite Gmail: só botão Google, sem campos de senha ─── */
function GoogleInviteScreen({invitedEmail,onSuccess,onBack,theme}){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const c=theme.t;

  const handleGoogle=async()=>{
    setLoading(true);setError("");
    try{
      const firebaseUser=await signInWithGoogle();
      const em=firebaseUser.email.toLowerCase();
      // Verificar se o e-mail bate com o convite
      if(em!==invitedEmail.toLowerCase()){
        await firebaseSignOut();
        setError(`Use a conta ${invitedEmail} para aceitar este convite.`);
        setLoading(false);return;
      }
      // Verificar se já tem conta criada
      const existing=await getUsernameByEmail(em);
      if(existing){onSuccess(existing,firebaseUser.photoURL||"");return;}
      // Criar conta automaticamente — username gerado a partir do e-mail
      const base=em.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g,"");
      let u=base;let suffix=1;
      while(CREDENTIALS[u]||(await window.storage.get(`${USER_CREDS_PREFIX}${u}`).catch(()=>null))?.value){u=`${base}${suffix++}`;}
      // Sem senha — conta só-Google (hash vazio, autenticação é pelo Google)
      await saveDynamicCred(u,"",em);
      const displayName=firebaseUser.displayName||em.split("@")[0];
      const photoURL=firebaseUser.photoURL||"";
      await window.storage.set(`planner-${u}-profile`,JSON.stringify({displayName,photoURL})).catch(()=>{});
      onSuccess(u,photoURL);
    }catch(e){
      if(e.code!=="auth/popup-closed-by-user")setError("Erro ao entrar com Google. Tente novamente.");
      setLoading(false);
    }
  };

  return(
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400,padding:"36px 28px",boxSizing:"border-box",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none",textAlign:"center"}}>
        <Logo size="large" theme={theme.mode}/>
        {/* Ícone de envelope */}
        <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,rgba(59,130,246,0.15),rgba(139,92,246,0.15))",display:"flex",alignItems:"center",justifyContent:"center",margin:"22px auto 0"}}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="url(#inv-grad)" strokeWidth="1.8" strokeLinecap="round"><defs><linearGradient id="inv-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3B82F6"/><stop offset="100%" stopColor="#8B5CF6"/></linearGradient></defs><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <h2 style={{fontSize:20,fontWeight:800,color:c.text,margin:"16px 0 6px",fontFamily:FS}}>Você foi convidado!</h2>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 6px",lineHeight:1.5}}>Acesse o Planner Semanal com sua conta Google.</p>
        {/* Chip do e-mail */}
        <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 14px",borderRadius:20,background:theme.mode==="dark"?"rgba(59,130,246,0.1)":"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",margin:"0 0 28px"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span style={{fontSize:12,color:"#3B82F6",fontWeight:600,fontFamily:F}}>{invitedEmail}</span>
        </div>
        <button onClick={handleGoogle} disabled={loading} style={{width:"100%",padding:"14px 16px",borderRadius:13,border:`1.5px solid ${c.inputBorder}`,background:c.inputBg,color:c.text,fontSize:15,fontWeight:600,cursor:loading?"default":"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:loading?0.7:1,transition:"all 0.2s ease",boxSizing:"border-box"}} onMouseEnter={e=>{if(!loading){e.currentTarget.style.borderColor="#4285F4";e.currentTarget.style.background="rgba(66,133,244,0.06)";}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.inputBorder;e.currentTarget.style.background=c.inputBg;}}>
          {loading?(<><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(66,133,244,0.3)",borderTopColor:"#4285F4",animation:"spin 0.8s linear infinite"}}/> Entrando...</>):(<><svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Entrar com Google</>)}
        </button>
        {error&&<p style={{color:"#EF4444",fontSize:12,margin:"12px 0 0",lineHeight:1.4}}>{error}</p>}
        <button onClick={onBack} style={{width:"100%",marginTop:10,padding:"11px",background:"transparent",border:`1px solid ${c.cardBorder}`,borderRadius:12,color:c.textMuted,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:F}}>← Voltar ao login</button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function InviteGate({invitedEmail,onSuccess,onBack,theme}){
  const [status,setStatus]=useState("checking"); // checking | valid | invalid | registered
  const c=theme.t;
  useEffect(()=>{
    (async()=>{
      try{
        const already=await isEmailRegistered(invitedEmail);
        if(already){setStatus("registered");return;}
        const invited=await isEmailInvited(invitedEmail);
        setStatus(invited?"valid":"invalid");
      }catch{setStatus("invalid");}
    })();
  },[]);
  if(status==="checking") return(<div style={{minHeight:"100vh",background:c.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:c.textMuted,fontFamily:F,fontSize:14}}>Verificando convite...</span></div>);
  if(status==="registered") return(<div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:24}}><span style={{fontSize:32}}>✅</span><p style={{color:c.text,fontFamily:F,fontSize:15,fontWeight:600,margin:0,textAlign:"center"}}>Esta conta já foi criada.</p><p style={{color:c.textMuted,fontFamily:F,fontSize:13,margin:0}}>Acesse pelo login normal.</p><button onClick={onBack} style={{marginTop:8,padding:"10px 24px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>Ir para o login</button></div>);
  if(status==="invalid") return(<div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:24}}><span style={{fontSize:32}}>🚫</span><p style={{color:c.text,fontFamily:F,fontSize:15,fontWeight:600,margin:0,textAlign:"center"}}>Link de convite inválido.</p><p style={{color:c.textMuted,fontFamily:F,fontSize:13,margin:0,textAlign:"center"}}>Este e-mail não possui um convite ativo.</p><button onClick={onBack} style={{marginTop:8,padding:"10px 24px",borderRadius:12,border:"none",background:"transparent",border:"1px solid "+c.cardBorder,color:c.textSub,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:F}}>Voltar</button></div>);
  // Gmail: tela só com botão Google
  const isGmail=invitedEmail.toLowerCase().endsWith("@gmail.com");
  if(isGmail) return <GoogleInviteScreen invitedEmail={invitedEmail} onSuccess={(u,photo)=>onSuccess(u,photo)} onBack={onBack} theme={theme}/>;
  return <FirstAccessScreen invitedEmail={invitedEmail} onSuccess={onSuccess} onBack={onBack} theme={theme}/>;
}

function FirstAccessScreen({ invitedEmail, onSuccess, onBack, theme }) {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const c = theme.t;

  const handleRegister = async () => {
    const dname = displayName.trim();
    if (!dname || dname.length < 2) { setError("Digite seu nome."); return; }
    if (password.length < 4) { setError("A senha precisa ter pelo menos 4 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    setLoading(true); setError("");
    try {
      const base = invitedEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g,"");
      let u = base; let suffix = 1;
      while (CREDENTIALS[u] || (await window.storage.get(`${USER_CREDS_PREFIX}${u}`).catch(()=>null))?.value) { u = `${base}${suffix++}`; }
      const hash = await hashStr(`${u}:${password}`);
      await saveDynamicCred(u, hash, invitedEmail);
      await window.storage.set(`planner-${u}-profile`, JSON.stringify({ displayName: dname, photoURL: "" })).catch(() => {});
      onSuccess(u);
    } catch (e) {
      setError("Erro ao criar conta. Tente novamente.");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Logo size="large" theme={theme.mode} />
          <h2 style={{fontSize:20,fontWeight:800,color:c.text,margin:"18px 0 4px",fontFamily:FS}}>Criar sua conta</h2>
          <p style={{fontSize:12,color:c.textSub,margin:0}}>Convite para <strong style={{color:c.text}}>{invitedEmail}</strong></p>
        </div>
        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Seu nome</span>
          <input autoFocus value={displayName} onChange={e=>setDisplayName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("fa-pass")?.focus()} placeholder="ex: João Silva" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error&&!displayName?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F}}/>
          <p style={{fontSize:10,color:c.textMuted,margin:"4px 0 0"}}>Aparece no app como "Olá, João"</p>
        </div>
        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Senha</span>
          <input id="fa-pass" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("fa-confirm")?.focus()} placeholder="mínimo 4 caracteres" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Confirmar senha</span>
          <input id="fa-confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRegister()} placeholder="repita a senha" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error&&password!==confirm?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F}}/>
        </div>
        {error&&<p style={{color:"#EF4444",fontSize:13,margin:"10px 0 0",lineHeight:1.4}}>{error}</p>}
        <button onClick={handleRegister} disabled={loading} style={{width:"100%",marginTop:18,padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:F,opacity:loading?0.7:1}}>
          {loading?"Criando conta...":"Criar conta"}
        </button>
        <button onClick={onBack} style={{width:"100%",marginTop:8,padding:"11px",background:"transparent",border:`1px solid ${c.cardBorder}`,borderRadius:12,color:c.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>← Voltar</button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

/* ─── Admin Panel Modal ─── */
function AdminPanel({ onClose, theme }) {
  const [invites, setInvites] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [msg, setMsg] = useState("");
  const c = theme.t;

  useEffect(() => {
    async function loadAll() {
      const list = await loadInvites();
      setInvites(list);
      try {
        const keys = await window.storage.list(USER_CREDS_PREFIX);
        const users = await Promise.all((keys.keys||[]).map(async k => {
          try {
            const r = await window.storage.get(k);
            if (!r || !r.value) return null;
            const d = JSON.parse(r.value);
            let lastSeen = null;
            try { const ls = await window.storage.get(`last-seen-${d.username}`); if (ls && ls.value) lastSeen = parseInt(ls.value); } catch {}
            return { ...d, lastSeen, _key: k };
          } catch { return null; }
        }));
        // Deduplicar por e-mail — manter o que tem lastSeen mais recente
        const seen = {};
        for (const u of users.filter(Boolean)) {
          const key = (u.email||u.username||"").toLowerCase();
          if (!seen[key] || (u.lastSeen||0) > (seen[key].lastSeen||0)) seen[key] = u;
        }
        setRegisteredUsers(Object.values(seen));
      } catch {}
      setLoading(false);
    }
    loadAll();
  }, []);

  const addInvite = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setMsg("E-mail inválido."); return; }
    if (invites.some(i => i.email === email)) { setMsg("Este e-mail já foi convidado."); return; }
    setSaving(true); setMsg("");
    const updated = [...invites, { email, createdAt: new Date().toISOString() }];
    await saveInvites(updated);
    setInvites(updated); setNewEmail("");
    try {
      await callSendInviteEmail(email);
      setMsg(`✅ Convite enviado para ${email}!`);
    } catch (e) {
      setMsg(`⚠️ Salvo, mas falha ao enviar e-mail: ${e.message}`);
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 5000);
  };

  const removeInvite = async (email) => {
    const updated = invites.filter(i => i.email !== email);
    await saveInvites(updated);
    setInvites(updated);
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Excluir o usuário "${u.username}"? Ele precisará de um novo convite para acessar.`)) return;
    setDeletingUser(u.username);
    try {
      // Remover todos os registros user-creds com esse username ou email
      const keys = await window.storage.list(USER_CREDS_PREFIX);
      for (const k of (keys.keys||[])) {
        try {
          const r = await window.storage.get(k);
          if (r && r.value) {
            const d = JSON.parse(r.value);
            if (d.username === u.username || (u.email && d.email && d.email.toLowerCase() === u.email.toLowerCase())) {
              await window.storage.delete(k);
            }
          }
        } catch {}
      }
      // Remover last-seen
      try { await window.storage.delete(`last-seen-${u.username}`); } catch {}
      // Remover da lista de convites (para permitir reenvio limpo)
      if (u.email) {
        const updatedInvites = invites.filter(i => i.email.toLowerCase() !== u.email.toLowerCase());
        await saveInvites(updatedInvites);
        setInvites(updatedInvites);
      }
      setRegisteredUsers(prev => prev.filter(r => r.username !== u.username));
      setMsg(`✅ Usuário "${u.username}" excluído. Agora você pode reenviar o convite.`);
      setTimeout(() => setMsg(""), 6000);
    } catch (e) {
      setMsg(`❌ Erro ao excluir: ${e.message}`);
    }
    setDeletingUser(null);
  };

  const clearUserData = async (u) => {
    if (!window.confirm(`Limpar TODOS os dados (tarefas e histórico) de "${u.username}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingUser(`clear-${u.username}`);
    try {
      const sun = getSunday(new Date()); const sat = getSaturday(new Date());
      const empty = [{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:[]}];
      await window.storage.set(`gestor-${u.username}-data`, JSON.stringify(empty));
      await window.storage.set(`gestor-${u.username}-history`, JSON.stringify([]));
      setMsg(`✅ Dados de "${u.username}" limpos com sucesso.`);
      setTimeout(() => setMsg(""), 5000);
    } catch (e) {
      setMsg(`❌ Erro ao limpar: ${e.message}`);
    }
    setDeletingUser(null);
  };

  // Separar: quais convites ainda estão pendentes (email não tem conta criada)
  const registeredEmails = new Set(registeredUsers.map(u => (u.email||"").toLowerCase()));
  const pendingInvites = invites.filter(i => !registeredEmails.has(i.email.toLowerCase()));

  const fmtLastSeen = (ts) => {
    if (!ts) return null;
    const diff = Date.now() - ts;
    if (diff < 5 * 60 * 1000) return { label: "Ativo agora", color: "#10B981", dot: "#10B981" };
    if (diff < 60 * 60 * 1000) return { label: `${Math.floor(diff/60000)}min atrás`, color: "#F59E0B", dot: "#F59E0B" };
    if (diff < 24 * 60 * 60 * 1000) return { label: `hoje ${new Date(ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`, color: c.textSub, dot: "#6366F1" };
    if (diff < 7 * 24 * 60 * 60 * 1000) return { label: new Date(ts).toLocaleDateString("pt-BR",{weekday:"short",hour:"2-digit",minute:"2-digit"}), color: c.textSub, dot: "#6B7280" };
    return { label: new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}), color: c.textMuted, dot: "#6B7280" };
  };

  const SectionHeader = ({ children, count }) => (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
      <span style={{fontSize:12,fontWeight:700,color:c.textMuted,fontFamily:F,textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</span>
      {count!=null && <span style={{fontSize:10,fontWeight:700,color:c.textMuted,background:c.taskBg,border:`1px solid ${c.cardBorder}`,borderRadius:20,padding:"1px 7px"}}>{count}</span>}
      <div style={{flex:1,height:1,background:c.cardBorder}}/>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:16,animation:"fadeIn 0.2s ease"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",background:c.modalBg,border:"1px solid rgba(139,92,246,0.25)",borderRadius:22,padding:28,boxShadow:"0 8px 50px rgba(0,0,0,0.5)"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div style={{width:42,height:42,borderRadius:12,background:"rgba(139,92,246,0.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"><path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/><path d="M12 14c-7 0-9 3-9 4v1h18v-1c0-1-2-4-9-4z"/><path d="M19 8l2 2-6 6"/></svg>
          </div>
          <div style={{flex:1}}>
            <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:0,fontFamily:FS}}>Painel de Admin</h2>
            <p style={{fontSize:12,color:"#8B5CF6",margin:0,fontWeight:600}}>Acesso exclusivo — xande</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.5}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Convidar */}
        <div style={{background:"rgba(139,92,246,0.06)",borderRadius:14,padding:16,marginBottom:24,border:"1px solid rgba(139,92,246,0.12)"}}>
          <h3 style={{fontSize:13,fontWeight:700,color:c.text,margin:"0 0 4px",fontFamily:F}}>📨 Convidar novo usuário</h3>
          <p style={{fontSize:11,color:c.textMuted,margin:"0 0 12px",lineHeight:1.4}}>O usuário convidado poderá entrar com Google ou criar uma conta própria.</p>
          <div style={{display:"flex",gap:8}}>
            <input value={newEmail} onChange={e=>setNewEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addInvite()} placeholder="email@exemplo.com" type="email" style={{flex:1,padding:"10px 14px",fontSize:13,borderRadius:10,background:c.inputBg,border:`1.5px solid ${c.inputBorder}`,color:c.inputText,outline:"none",fontFamily:F}}/>
            <button onClick={addInvite} disabled={saving} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#8B5CF6,#3B82F6)",color:"#fff",fontSize:13,fontWeight:700,cursor:saving?"default":"pointer",fontFamily:F,flexShrink:0,opacity:saving?0.7:1}}>
              {saving?"...":"Convidar"}
            </button>
          </div>
          {msg&&<p style={{fontSize:12,margin:"8px 0 0",color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</p>}
        </div>

        {loading ? (
          <p style={{fontSize:12,color:c.textMuted,fontFamily:F,textAlign:"center",padding:"20px 0"}}>Carregando...</p>
        ) : (<>

          {/* Usuários registrados */}
          {registeredUsers.length > 0 && (
            <div style={{marginBottom:20}}>
              <SectionHeader count={registeredUsers.length}>Usuários ativos</SectionHeader>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {registeredUsers.map((u,i) => {
                  const seen = fmtLastSeen(u.lastSeen);
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:c.taskBg,border:`1px solid ${c.cardBorder}`}}>
                      <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.15))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#8B5CF6",fontFamily:FS}}>{(u.username||"?").charAt(0).toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13,color:c.text,fontFamily:F,fontWeight:600}}>{u.username}</span>
                          {seen && <div style={{width:6,height:6,borderRadius:"50%",background:seen.dot,flexShrink:0}}/>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:1}}>
                          <span style={{fontSize:10,color:c.textMuted,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email||"—"}</span>
                        </div>
                        {seen && <span style={{fontSize:10,color:seen.color,fontFamily:F,fontWeight:seen.label==="Ativo agora"?700:400}}>{seen.label==="Ativo agora"?"● Ativo agora":`Visto: ${seen.label}`}</span>}
                        {!seen && <span style={{fontSize:10,color:c.textMuted,fontFamily:F,opacity:0.5}}>Nunca acessou</span>}
                      </div>
                      <button onClick={()=>clearUserData(u)} disabled={!!deletingUser} title="Limpar dados (tarefas e histórico)" style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.3,flexShrink:0,transition:"opacity 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="0.3"}>
                        {deletingUser===`clear-${u.username}`
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                        }
                      </button>
                      <button onClick={()=>deleteUser(u)} disabled={!!deletingUser} title="Excluir usuário" style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.3,flexShrink:0,transition:"opacity 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="0.3"}>
                        {deletingUser===u.username
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Convites pendentes */}
          <div>
            <SectionHeader count={pendingInvites.length}>Convites pendentes</SectionHeader>
            {pendingInvites.length === 0 ? (
              <p style={{fontSize:12,color:c.textMuted,fontFamily:F,textAlign:"center",padding:"14px 0",opacity:0.6}}>Nenhum convite pendente.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {pendingInvites.map((inv,i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:c.taskBg,border:`1px solid ${c.cardBorder}`}}>
                    <div style={{width:34,height:34,borderRadius:9,background:"rgba(251,191,36,0.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:13,color:c.text,fontFamily:F,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{inv.email}</span>
                      <span style={{fontSize:10,color:c.textMuted,fontFamily:F}}>Enviado em {new Date(inv.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <button onClick={()=>removeInvite(inv.email)} title="Remover convite" style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.35,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </>)}
      </div>
    </div>
  );
}

const RESET_TOKEN_PREFIX = "reset-token-";

/* ─── Reset Password Screen ─── */
function ResetPasswordScreen({ token, onSuccess, theme }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [tokenError, setTokenError] = useState("");
  const [done, setDone] = useState(false);
  const c = theme.t;

  useEffect(() => {
    async function verifyToken() {
      try {
        const r = await window.storage.get(`${RESET_TOKEN_PREFIX}${token}`).catch(() => null);
        if (!r || !r.value) { setTokenError("Link inválido ou expirado."); return; }
        const data = JSON.parse(r.value);
        if (Date.now() > data.expiresAt) { setTokenError("Este link expirou. Solicite um novo reset de senha."); return; }
        setTokenData(data);
      } catch { setTokenError("Erro ao validar link. Tente novamente."); }
    }
    verifyToken();
  }, [token]);

  const handleReset = async () => {
    if (password.length < 4) { setError("A senha precisa ter pelo menos 4 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    setLoading(true); setError("");
    try {
      const u = tokenData.username.toLowerCase().trim();
      const hash = await hashStr(`${u}:${password}`);
      const keys = await window.storage.list(USER_CREDS_PREFIX).catch(() => ({ keys: [] }));
      let savedAny = false;
      for (const k of (keys.keys || [])) {
        try {
          const r = await window.storage.get(k);
          if (r && r.value) {
            const d = JSON.parse(r.value);
            if (d.username && d.username.toLowerCase() === u) {
              await window.storage.set(k, JSON.stringify({ ...d, hash }));
              savedAny = true;
            }
          }
        } catch (e) {
 }
      }
      if (!savedAny) {
        const newKey = `${USER_CREDS_PREFIX}${u}`;
        await window.storage.set(newKey, JSON.stringify({ username: u, email: tokenData.email || "", hash }));
      }
      await window.storage.delete(`${RESET_TOKEN_PREFIX}${token}`).catch(() => {});
      // Limpar sessão para forçar login com a nova senha
      // Não escrever mais AUTH_KEY/USER_KEY no Firestore — sessão é 100% localStorage
      setDone(true);
    } catch (e) {
 setError("Erro ao redefinir senha. Tente novamente."); }
    setLoading(false);
  };

  if (done) return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",textAlign:"center",background:c.loginCardBg,border:`1px solid rgba(16,185,129,0.2)`,borderRadius:24,animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{marginBottom:16}}><Logo size="large" theme={theme.mode} /></div>
        <div style={{width:52,height:52,borderRadius:14,background:"rgba(16,185,129,0.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{fontSize:20,fontWeight:800,color:c.text,margin:"0 0 8px",fontFamily:FS}}>Senha redefinida!</h2>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 24px",lineHeight:1.5}}>Sua senha foi atualizada com sucesso. Faça login com a nova senha.</p>
        <button onClick={onSuccess} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>Fazer login</button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );

  if (tokenError) return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",background:c.loginCardBg,border:`1px solid rgba(239,68,68,0.25)`,borderRadius:24,textAlign:"center",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{width:48,height:48,borderRadius:14,background:"rgba(239,68,68,0.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:"0 0 8px",fontFamily:FS}}>Link inválido</h2>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 20px",lineHeight:1.5}}>{tokenError}</p>
        <button onClick={onSuccess} style={{width:"100%",padding:"12px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Voltar ao login</button>
      </div>
    </div>
  );

  if (!tokenData) return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <p style={{color:c.textSub,fontFamily:F}}>Verificando link...</p>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",textAlign:"center",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{marginBottom:16}}><Logo size="large" theme={theme.mode} /></div>
        <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:"0 0 4px",fontFamily:FS}}>Nova senha</h2>
        <p style={{fontSize:12,color:c.textSub,margin:"0 0 20px"}}>Para o usuário <span style={{color:"#3B82F6",fontWeight:600}}>{tokenData.username}</span></p>
        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Nova senha</span>
          <input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("rp-confirm")?.focus()} placeholder="mínimo 4 caracteres" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Confirmar nova senha</span>
          <input id="rp-confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleReset()} placeholder="repita a nova senha" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error&&password!==confirm?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F}}/>
        </div>
        {error&&<p style={{color:"#EF4444",fontSize:13,margin:"10px 0 0"}}>{error}</p>}
        <button onClick={handleReset} disabled={loading} style={{width:"100%",marginTop:18,padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:F,opacity:loading?0.7:1}}>
          {loading?"Salvando...":"Redefinir senha"}
        </button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

/* ─── Forgot Password Screen ─── */
function ForgotPasswordScreen({ onBack, theme }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const c = theme.t;

  const handleSend = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@")) { setError("Digite um e-mail válido."); return; }
    setLoading(true); setError("");
    try {
      // Verificar se email tem conta criada
      const username = await getUsernameByEmail(em);
      if (!username) { setError("Nenhuma conta encontrada com este e-mail."); setLoading(false); return; }
      // Gerar token único
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("");
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hora
      await window.storage.set(`${RESET_TOKEN_PREFIX}${token}`, JSON.stringify({ username, email: em, expiresAt }));
      const appBase = "https://plannersemanal.com/";
      const resetUrl = `${appBase}?reset=${token}`;
      await callSendResetEmail(em, resetUrl);
      setSent(true);
    } catch (e) { setError(e.message || "Erro ao enviar. Tente novamente."); }
    setLoading(false);
  };

  if (sent) return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,textAlign:"center",animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{marginBottom:16}}><Logo size="large" theme={theme.mode} /></div>
        <div style={{width:52,height:52,borderRadius:14,background:"rgba(16,185,129,0.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:"0 0 8px",fontFamily:FS}}>E-mail enviado!</h2>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 20px",lineHeight:1.5}}>Verifique sua caixa de entrada em <strong style={{color:c.text}}>{email}</strong> e clique no link para redefinir sua senha.</p>
        <button onClick={onBack} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>Voltar ao login</button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <div style={{width:"100%",maxWidth:400,padding:"32px 28px",boxSizing:"border-box",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:"fadeIn 0.5s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{marginBottom:16}}><Logo size="large" theme={theme.mode} /></div>
          <div style={{width:48,height:48,borderRadius:14,background:"rgba(59,130,246,0.1)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h2 style={{fontSize:20,fontWeight:800,color:c.text,margin:"0 0 4px",fontFamily:FS}}>Esqueceu a senha?</h2>
          <p style={{fontSize:12,color:c.textSub,margin:0,lineHeight:1.5}}>Digite seu e-mail e enviaremos um link de redefinição.</p>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>E-mail</span>
          <input autoFocus type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSend()} placeholder="seu@email.com" style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"11px 14px",fontSize:14,background:c.inputBg,border:`1.5px solid ${error?"#EF4444":c.inputBorder}`,borderRadius:10,color:c.inputText,outline:"none",fontFamily:F}}/>
        </div>
        {error&&<p style={{color:"#EF4444",fontSize:12,margin:"8px 0 0",lineHeight:1.4}}>{error}</p>}
        <button onClick={handleSend} disabled={loading} style={{width:"100%",marginTop:18,padding:"13px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:F,opacity:loading?0.7:1}}>
          {loading?"Enviando...":"Enviar link de reset"}
        </button>
        <button onClick={onBack} style={{width:"100%",marginTop:8,padding:"11px",background:"transparent",border:`1px solid ${c.cardBorder}`,borderRadius:12,color:c.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>← Voltar ao login</button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

function LoginScreen({ onLogin, theme }) {
  const [email,setEmail]=useState(""); const [pin,setPin]=useState("");
  const [error,setError]=useState(false); const [shake,setShake]=useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [firstAccessEmail, setFirstAccessEmail] = useState(() => {
    try { const p = new URLSearchParams(window.location.search); const inv = p.get("invite"); if (inv) return decodeURIComponent(inv); } catch {} return null;
  });
  const c=theme.t;

  const handleSubmit = async () => {
    if(!email.trim()||!pin){setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);return;}
    const em = email.trim().toLowerCase();
    // Resolver username a partir do e-mail
    let resolvedUser = em.includes("@") ? (await getUsernameByEmail(em) || em) : em;
    if(await verifyCredentials(resolvedUser,pin)){onLogin(resolvedUser,"");}
    else{setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);}
  };

  const handleGoogle = async () => {
    setGoogleLoading(true); setGoogleError("");
    try {
      const firebaseUser = await signInWithGoogle();
      const em = firebaseUser.email.toLowerCase();
      const googlePhoto = firebaseUser.photoURL || "";
      if (GMAIL_MAP[em]) { onLogin(GMAIL_MAP[em], googlePhoto); return; }
      const username = await getUsernameByEmail(em);
      if (username) { onLogin(username, googlePhoto); return; }
      const invited = await isEmailInvited(em);
      if (invited) { setFirstAccessEmail(em); return; }
      await firebaseSignOut();
      setGoogleError("Este e-mail não está autorizado. Solicite um convite ao administrador.");
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        setGoogleError("Erro ao entrar com Google. Tente novamente.");
      }
    }
    setGoogleLoading(false);
  };

  if (showForgot) return <ForgotPasswordScreen onBack={() => setShowForgot(false)} theme={theme} />;

  if (firstAccessEmail) {
    return <InviteGate invitedEmail={firstAccessEmail} onSuccess={(username, photo="") => { try { window.history.replaceState({}, "", window.location.pathname); } catch {} onLogin(username, photo); }} onBack={() => { try { window.history.replaceState({}, "", window.location.pathname); } catch {} setFirstAccessEmail(null); setGoogleLoading(false); }} theme={theme} />;
  }

  return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px",transition:"background 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <button className="theme-btn" onClick={theme.toggle} style={{position:"fixed",top:16,right:16,background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}} title={theme.mode==="dark"?"Modo claro":"Modo escuro"}>{theme.mode==="dark"?(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>):(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>)}</button>
      <div style={{width:"100%",maxWidth:400,padding:"32px 24px",textAlign:"center",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:shake?"shake 0.5s ease":"fadeIn 0.6s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none",boxSizing:"border-box",minWidth:0}}>
        <div style={{ marginBottom: 16 }}><Logo size="large" theme={theme.mode} /></div>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 20px",lineHeight:1.5}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>

        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>E-mail</span>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("pin-input")?.focus()} placeholder="seu@email.com" autoFocus
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F,transition:"border-color 0.2s ease"}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Senha</span>
            <button onClick={()=>setShowForgot(true)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:11,color:"#3B82F6",fontFamily:F,fontWeight:500}}>Esqueci a senha</button>
          </div>
          <input id="pin-input" type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="sua senha"
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F,transition:"border-color 0.2s ease"}}/>
        </div>
        {error&&<p style={{color:"#EF4444",fontSize:13,margin:"10px 0 0"}}>E-mail ou senha incorretos</p>}
        <button onClick={handleSubmit} style={{width:"100%",marginTop:18,padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>Entrar</button>

        <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0"}}>
          <div style={{flex:1,height:1,background:c.divider}}/>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:500}}>ou entre com</span>
          <div style={{flex:1,height:1,background:c.divider}}/>
        </div>

        <button onClick={handleGoogle} disabled={googleLoading} style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`1.5px solid ${c.inputBorder}`,background:c.inputBg,color:c.text,fontSize:14,fontWeight:600,cursor:googleLoading?"default":"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:googleLoading?0.7:1,transition:"all 0.2s ease"}} onMouseEnter={e=>{if(!googleLoading){e.currentTarget.style.borderColor="#4285F4";e.currentTarget.style.background="rgba(66,133,244,0.06)"}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.inputBorder;e.currentTarget.style.background=c.inputBg}}>
          {googleLoading ? (<><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(66,133,244,0.3)",borderTopColor:"#4285F4",animation:"spin 0.8s linear infinite"}}/> Entrando...</>) : (<><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Entrar com Google</>)}
        </button>
        {googleError&&<p style={{color:"#EF4444",fontSize:12,margin:"8px 0 0",lineHeight:1.4,textAlign:"left"}}>{googleError}</p>}
      </div>
      <div style={{textAlign:"center",marginTop:28,opacity:0.4}}>
        <p style={{fontSize:11,color:c.textSub,margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
        <p style={{fontSize:10,color:c.textMuted,margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ─── Progress Ring ─── */
function ProgressRing({percent,color,size=48,c}){
  const strokeW = size <= 32 ? 3 : 4;
  const r=(size-strokeW*2)/2,circ=2*Math.PI*r,offset=circ-(percent/100)*circ;
  const trackColor = c ? c.progressRingBg : "rgba(255,255,255,0.08)";
  const textFill = c ? c.text : "#fff";
  const fontSize = size <= 32 ? 9 : size < 44 ? 11 : 13;
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0,overflow:"visible"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeW}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeW} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%",transition:"stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)"}}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{fontSize,fill:textFill,fontWeight:700,fontFamily:"DM Sans, sans-serif"}}>{percent}%</text>
    </svg>
  );
}

/* ─── Confirm Delete Modal ─── */
function ConfirmDeleteModal({title,description,onConfirm,onCancel,c}){
  const tc = c || themes.dark;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16,animation:"fadeIn 0.15s ease"}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:tc.modalBg,border:`1px solid rgba(239,68,68,0.25)`,borderRadius:18,padding:24,boxShadow:tc===themes.light?"0 8px 40px rgba(0,0,0,0.15)":"0 8px 40px rgba(0,0,0,0.5)"}}>
        <div style={{width:44,height:44,borderRadius:12,background:"rgba(239,68,68,0.12)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
        <h3 style={{fontSize:18,fontWeight:700,color:tc.text,margin:"0 0 6px",fontFamily:FS,letterSpacing:"-0.01em"}}>{title}</h3>
        <p style={{fontSize:13,color:tc.textSub,margin:"0 0 20px",lineHeight:1.5,fontFamily:F}}>{description}</p>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onConfirm} style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",background:"#EF4444",color:"#fff",fontSize:13,fontWeight:700,fontFamily:F}}>Excluir</button>
          <button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Task View Modal (visualização + edição + anexos) ─── */
function TaskViewModal({task,color,projectName,projectEmoji,onToggle,onUpdate,onClose,c}){
  const tc = c || themes.dark;
  const dayInfo=WEEK_DAYS.find(d=>d.key===task.day);
  const prio=priorityConfig[task.priority];

  const [editing,setEditing]=useState(false);
  const [editText,setEditText]=useState(task.text);
  const [editDesc,setEditDesc]=useState(task.description||"");
  const [editPriority,setEditPriority]=useState(task.priority);
  const [editDay,setEditDay]=useState(task.day);
  const [attachments,setAttachments]=useState(task.attachments||[]);

  const startEdit=()=>{setEditText(task.text);setEditDesc(task.description||"");setEditPriority(task.priority);setEditDay(task.day);setAttachments(task.attachments||[]);setEditing(true);};
  const cancelEdit=()=>{setEditing(false);setAttachments(task.attachments||[]);};
  const saveEdit=()=>{onUpdate({text:editText.trim()||task.text,description:editDesc.trim(),priority:editPriority,day:editDay,attachments});setEditing(false);};

  // Escape: em edição cancela edição, fora fecha o modal
  useEffect(()=>{
    const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();if(editing)cancelEdit();else onClose();}};
    window.addEventListener("keydown",h,true);
    return()=>window.removeEventListener("keydown",h,true);
  },[editing]);

  // Bloquear qualquer evento de drag/touch de arrastar elementos do DOM por baixo
  const blockDrag=(e)=>{e.preventDefault();e.stopPropagation();};
  const blockMouse=(e)=>e.stopPropagation();

  // Renderizar um anexo na visualização
  const renderAttachment=(att,i)=>{
    const embed=att.type==="link"?getVideoEmbed(att.data):null;
    return(
      <div key={i} style={{borderRadius:12,overflow:"hidden",border:`1px solid ${tc.cardBorder}`}}>
        {att.type==="image"&&<img src={att.data} alt={att.name} style={{width:"100%",display:"block",maxHeight:300,objectFit:"contain",background:"rgba(0,0,0,0.2)"}}/>}
        {att.type==="video_file"&&<video src={att.data} controls style={{width:"100%",display:"block",maxHeight:280,background:"#000"}}/>}
        {att.type==="link"&&embed&&<iframe src={embed} style={{width:"100%",height:220,border:"none",display:"block"}} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowFullScreen title={att.name}/>}
        {att.type==="link"&&!embed&&(
          <a href={att.data} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",color,fontFamily:F,fontSize:12,fontWeight:600,textDecoration:"none",wordBreak:"break-all"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            {att.data}
          </a>
        )}
        {att.type==="document"&&(att.data.startsWith("data:application/pdf")?(
          <iframe src={att.data} style={{width:"100%",height:300,border:"none",display:"block"}} title={att.name}/>
        ):(
          <a href={att.data} download={att.name} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",color,fontFamily:F,fontSize:12,fontWeight:600,textDecoration:"none"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {att.name}
          </a>
        ))}
      </div>
    );
  };

  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(5px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16,animation:"fadeIn 0.2s ease"}}
      onMouseDown={e=>{if(e.target===e.currentTarget&&!editing)onClose();}}
      onDragStart={blockDrag}
    >
      <div
        onMouseDown={blockMouse}
        onDragStart={blockDrag}
        draggable={false}
        style={{width:"100%",maxWidth:480,maxHeight:"90vh",background:tc.modalBg,border:`1px solid ${color}30`,borderRadius:20,boxShadow:"0 8px 48px rgba(0,0,0,0.45)",display:"flex",flexDirection:"column",overflow:"hidden"}}
      >
        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${color}18,${color}06)`,borderBottom:`1px solid ${color}18`,padding:"20px 20px 16px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <div onClick={e=>{e.stopPropagation();if(!editing)onToggle();}} style={{width:24,height:24,borderRadius:7,flexShrink:0,cursor:editing?"default":"pointer",border:task.done?"none":`2.5px solid ${color}`,background:task.done?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease",marginTop:2,opacity:editing?0.4:1}}>
              {task.done&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              {editing?(
                <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={Math.max(1,editText.split("\n").length)} style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",fontSize:16,fontWeight:700,borderRadius:8,background:tc.inputBg,border:`1.5px solid ${color}50`,color:tc.inputText,outline:"none",fontFamily:FS,resize:"none",lineHeight:1.4,overflow:"hidden"}}/>
              ):(
                <h2 style={{margin:0,fontSize:17,fontWeight:800,color:task.done?tc.textMuted:tc.text,fontFamily:FS,lineHeight:1.4,textDecoration:task.done?"line-through":"none",wordBreak:"break-word"}}>{task.text}</h2>
              )}
              {!editing&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                {projectName&&<span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:`${color}22`,color,fontFamily:F,display:"flex",alignItems:"center",gap:4}}>{projectEmoji&&<span style={{fontSize:12}}>{projectEmoji}</span>}{projectName}</span>}
                {dayInfo&&<span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:tc.tagBg,color:tc.tagColor,fontFamily:F}}>{dayInfo.full}</span>}
                <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:prio.bg,color:prio.dot,fontFamily:F,display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:prio.dot}}/>{prio.label}</span>
                {task.done&&<span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,background:"rgba(16,185,129,0.12)",color:"#10B981",fontFamily:F}}>✓ Concluída</span>}
              </div>}
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
              {!editing&&(
                <button onClick={startEdit} title="Editar" style={{background:`${color}18`,border:`1px solid ${color}30`,borderRadius:8,cursor:"pointer",padding:"5px 7px",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background=`${color}30`} onMouseLeave={e=>e.currentTarget.style.background=`${color}18`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
              {/* X: sempre fecha o modal por completo */}
              <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.35,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{padding:"18px 20px 20px",overflowY:"auto",flex:1}}>

          {/* Descrição */}
          <div style={{marginBottom:16}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Descrição</span>
            {editing?(
              <textarea value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Adicione uma descrição..." rows={3} style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:13,borderRadius:10,background:tc.inputBg,border:`1.5px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,resize:"vertical",lineHeight:1.6}}/>
            ):task.description?(
              <p style={{margin:0,fontSize:13,color:tc.textSub,fontFamily:F,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{task.description}</p>
            ):(
              <p style={{margin:0,fontSize:13,color:tc.textMuted,fontFamily:F,fontStyle:"italic",opacity:0.5}}>Sem descrição.</p>
            )}
          </div>

          {/* Dia + Prioridade (edição) */}
          {editing&&(
            <div style={{display:"flex",gap:16,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:120}}>
                <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Dia</span>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>setEditDay(d.key)} style={{padding:"4px 7px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:editDay===d.key?color:tc.inputBg,color:editDay===d.key?"#fff":tc.textSub,transition:"all 0.15s"}}>{d.label}</button>))}</div>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Prioridade</span>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>setEditPriority(k)} style={{padding:"4px 10px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:editPriority===k?v.dot:v.bg,color:editPriority===k?"#fff":v.dot,transition:"all 0.15s"}}>{v.label}</button>))}</div>
              </div>
            </div>
          )}

          {/* Anexos: visualização */}
          {!editing&&(task.attachments||[]).length>0&&(
            <div style={{marginBottom:8}}>
              <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:10,textTransform:"uppercase",letterSpacing:0.6}}>Anexos</span>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>{(task.attachments||[]).map((att,i)=>renderAttachment(att,i))}</div>
            </div>
          )}

          {/* Anexos: edição */}
          {editing&&(
            <div style={{marginBottom:16}}>
              <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Anexos</span>
              <AttachmentSection attachments={attachments} setAttachments={setAttachments} color={color} tc={tc}/>
            </div>
          )}

          {/* Salvar / Cancelar — voltam para visualização, não fecham o modal */}
          {editing&&(
            <div style={{display:"flex",gap:8,paddingTop:4,borderTop:`1px solid ${tc.divider}`,marginTop:4}}>
              <button onClick={saveEdit} style={{flex:1,padding:"11px",borderRadius:11,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${color},${color}cc)`,color:"#fff",fontSize:13,fontWeight:700,fontFamily:F}}>Salvar</button>
              <button onClick={cancelEdit} style={{padding:"11px 20px",borderRadius:11,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Task Item ─── */
function TaskItem({task,color,onToggle,onUpdate,onDelete,projectName,projectEmoji,onMoveWeek,onEditingChange,openTaskId,onOpen,c,projects,showCategoryPicker}){
  const [showViewModal,setShowViewModal]=useState(false);
  const openViewModal=()=>{setShowViewModal(true);if(onOpen)onOpen(task.id);};
  const closeViewModal=()=>{setShowViewModal(false);if(onOpen)onOpen(null);};
  const showOpts = openTaskId === task.id;
  const [editText,setEditText]=useState(task.text);
  const [isEditing,setIsEditing]=useState(false);
  useEffect(()=>{
    if(!showOpts)return;
    const handler=(e)=>{
      if(e.key==="Escape"){
        e.stopPropagation();
        if(isEditing){setEditText(task.text);setIsEditing(false);}
        else{if(onOpen)onOpen(null);if(onEditingChange)onEditingChange(false);}
      }
    };
    window.addEventListener("keydown",handler,true);
    return()=>window.removeEventListener("keydown",handler,true);
  },[showOpts,isEditing]);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const dayInfo=WEEK_DAYS.find(d=>d.key===task.day);
  const saveText=()=>{if(editText.trim()&&editText.trim()!==task.text)onUpdate({text:editText.trim()});setIsEditing(false);};
  const toggleOpts=(e)=>{e.stopPropagation();const next=!showOpts;if(onOpen)onOpen(next?task.id:null);if(onEditingChange)onEditingChange(next);setShowDeleteConfirm(false);};
  const tc = c || themes.dark;
  return(
    <>
    {showViewModal&&<TaskViewModal task={task} color={color} projectName={projectName} projectEmoji={projectEmoji} onToggle={()=>{onToggle();closeViewModal();}} onUpdate={u=>onUpdate(u)} onClose={closeViewModal} c={tc}/>}
    <div className="task-card" style={{borderRadius:12,overflow:"hidden",background:task.done?tc.taskBgDone:tc.taskBg,border:`1px solid ${task.done?tc.taskBorderDone:tc.taskBorder}`,opacity:task.done?0.55:1}}>
      <div onClick={openViewModal} style={{padding:"10px 12px",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div onClick={e=>{e.stopPropagation();onToggle();}} style={{width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",border:task.done?"none":`2px solid ${color}`,background:task.done?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease",marginTop:1}}>
            {task.done&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <span style={{fontSize:13.5,lineHeight:1.4,color:tc.text,textDecoration:task.done?"line-through":"none",fontFamily:F,display:"block"}}>{task.text}</span>
            {task.description&&<span style={{fontSize:11,color:tc.textMuted,fontFamily:F,display:"block",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.description}</span>}
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5,flexWrap:"wrap"}}>
              {projectName&&<span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:4,background:`${color}20`,color,fontFamily:F,whiteSpace:"nowrap"}}>{projectName}</span>}
              {dayInfo&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,background:tc.tagBg,color:tc.tagColor,fontFamily:F}}>{dayInfo.label}</span>}
              <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:priorityConfig[task.priority].dot}}/>
            </div>
          </div>
          <div onClick={toggleOpts} style={{cursor:"pointer",padding:"2px 4px",opacity:0.5,transition:"opacity 0.2s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </div>
        </div>
      </div>
      {showOpts&&(
        <div draggable={false} onDragStart={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{padding:"8px 12px 12px",borderTop:`1px solid ${tc.divider}`,animation:"fadeIn 0.2s ease"}}>
          <div style={{marginBottom:10}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Título</span>
            {isEditing?(<div style={{display:"flex",flexDirection:"column",gap:6}}><textarea autoFocus value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveText();}if(e.key==="Escape"){setEditText(task.text);setIsEditing(false);}}} rows={Math.max(2,editText.split("\n").length)} style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",fontSize:12,borderRadius:8,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,resize:"none",lineHeight:1.5,overflow:"hidden"}}/><button onClick={saveText} style={{alignSelf:"flex-end",padding:"5px 14px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>OK</button></div>)
            :(<button onClick={()=>setIsEditing(true)} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"6px 10px",borderRadius:8,background:tc.inputBg,border:`1px solid ${tc.cardBorder}`,color:tc.textSub,fontSize:12,cursor:"pointer",fontFamily:F,width:"100%",textAlign:"left",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>✏️ {task.text}</button>)}
          </div>
          {/* Descrição */}
          <div style={{marginBottom:10}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Descrição</span>
            <DescriptionEditor task={task} color={color} onUpdate={onUpdate} tc={tc}/>
          </div>
          {/* Projeto (só na view dias da semana) */}
          {showCategoryPicker&&projects&&projects.length>0&&(
            <div style={{marginBottom:8}}>
              <span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Projeto</span>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {projects.map(p=>(<button key={p.id} onClick={()=>onUpdate({_newProjectId:p.id})} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:10,fontWeight:600,borderRadius:6,border:`1px solid ${task._projectId===p.id?p.color:tc.cardBorder}`,cursor:"pointer",fontFamily:F,background:task._projectId===p.id?`${p.color}20`:tc.inputBg,color:task._projectId===p.id?p.color:tc.textSub,transition:"all 0.15s ease"}}><span style={{fontSize:12}}>{p.emoji}</span>{p.name}</button>))}
              </div>
            </div>
          )}
          <div style={{marginBottom:8}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Dia</span><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>onUpdate({day:d.key})} style={{padding:"4px 7px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.day===d.key?color:tc.inputBg,color:task.day===d.key?"#fff":tc.textSub,transition:"all 0.15s ease"}}>{d.label}</button>))}</div></div>
          <div style={{marginBottom:onMoveWeek?10:0}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Prioridade</span><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>onUpdate({priority:k})} style={{padding:"4px 10px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.priority===k?v.dot:v.bg,color:task.priority===k?"#fff":v.dot,transition:"all 0.15s ease"}}>{v.label}</button>))}</div></div>
          {onMoveWeek&&(<div style={{marginBottom:10}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Semana</span>{onMoveWeek}</div>)}
          {onDelete&&(<div style={{paddingTop:6,borderTop:`1px solid ${tc.divider}`}}>
            {showDeleteConfirm?(
              <div style={{borderRadius:8,background:tc.deleteDangerBg,border:`1px solid ${tc.deleteDangerBorder}`,padding:"10px 12px",animation:"fadeIn 0.15s ease"}}>
                <p style={{fontSize:11,color:"#EF4444",fontWeight:600,margin:"0 0 8px",fontFamily:F}}>Excluir esta tarefa?</p>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={onDelete} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#EF4444",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F}}>Excluir</button>
                  <button onClick={()=>setShowDeleteConfirm(false)} style={{flex:1,padding:"6px",borderRadius:7,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
                </div>
              </div>
            ):(
              <button onClick={()=>setShowDeleteConfirm(true)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${tc.deleteDangerBorder}`,background:tc.deleteDangerBg,color:"#EF4444",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Excluir tarefa</button>
            )}
          </div>)}
        </div>
      )}
    </div>
    </>
  );
}

/* ─── Description Editor (inline no painel de edição) ─── */
function DescriptionEditor({task,color,onUpdate,tc}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(task.description||"");
  const save=()=>{const d=val.trim();if(d!==(task.description||"").trim())onUpdate({description:d});setEditing(false);};
  if(editing) return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <textarea autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"){setVal(task.description||"");setEditing(false);}}} placeholder="Adicione uma descrição..." rows={3} style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",fontSize:12,borderRadius:8,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,resize:"none",lineHeight:1.5}}/>
      <div style={{display:"flex",gap:6}}><button onClick={save} style={{padding:"4px 14px",borderRadius:7,border:"none",background:color,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>OK</button><button onClick={()=>{setVal(task.description||"");setEditing(false);}} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${tc.cardBorder}`,background:"transparent",color:tc.textSub,fontSize:11,cursor:"pointer",fontFamily:F}}>Cancelar</button></div>
    </div>
  );
  return(
    <button onClick={()=>setEditing(true)} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"6px 10px",borderRadius:8,background:tc.inputBg,border:`1px solid ${tc.cardBorder}`,color:task.description?tc.textSub:tc.textMuted,fontSize:12,cursor:"pointer",fontFamily:F,width:"100%",textAlign:"left",whiteSpace:"pre-wrap",wordBreak:"break-word",fontStyle:task.description?"normal":"italic"}}>
      {task.description?task.description:"✏️ Adicionar descrição..."}
    </button>
  );
}

/* ─── Helpers de embed (compartilhado) ─── */
function getYoutubeEmbed(url){try{const u=new URL(url);let id=u.searchParams.get("v")||"";if(u.hostname==="youtu.be")id=u.pathname.slice(1).split("?")[0];if(u.hostname.includes("youtube")&&u.pathname.includes("/shorts/"))id=u.pathname.split("/shorts/")[1]?.split("?")[0]||"";return id?`https://www.youtube.com/embed/${id}`:null;}catch{return null;}}
function getVimeoEmbed(url){try{const m=url.match(/vimeo\.com\/(\d+)/);return m?`https://player.vimeo.com/video/${m[1]}`:null;}catch{return null;}}
function getDriveEmbed(url){try{const m=url.match(/\/d\/([a-zA-Z0-9_-]+)/);return m?`https://drive.google.com/file/d/${m[1]}/preview`:null;}catch{return null;}}
function getLoomEmbed(url){try{const m=url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);return m?`https://www.loom.com/embed/${m[1]}`:null;}catch{return null;}}
function getVideoEmbed(url){return getYoutubeEmbed(url)||getVimeoEmbed(url)||getDriveEmbed(url)||getLoomEmbed(url)||null;}

/* ─── AttachmentSection (reutilizável no modal e no AddTaskInput) ─── */
function AttachmentSection({attachments,setAttachments,color,tc,compact=false}){
  const [showMenu,setShowMenu]=useState(false);
  const [menuPos,setMenuPos]=useState(null);
  const [showLinkInput,setShowLinkInput]=useState(false);
  const [linkVal,setLinkVal]=useState("");
  const btnRef=useRef(null);
  const menuRef=useRef(null);
  const imgRef=useRef(null);
  const mediaRef=useRef(null);
  const docRef=useRef(null);

  useEffect(()=>{
    if(!showMenu)return;
    const h=(e)=>{
      if(btnRef.current?.contains(e.target))return;
      if(menuRef.current?.contains(e.target))return;
      setShowMenu(false);
    };
    setTimeout(()=>document.addEventListener("mousedown",h),0);
    return()=>document.removeEventListener("mousedown",h);
  },[showMenu]);

  const openMenu=(e)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    setMenuPos({top:rect.bottom+6,left:rect.left});
    setShowMenu(v=>!v);setShowLinkInput(false);
  };

  const handleMedia=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const type=f.type.startsWith("video/")?"video_file":"image";
    const reader=new FileReader();
    reader.onload=(ev)=>setAttachments(prev=>[...prev,{type,name:f.name,data:ev.target.result}]);
    reader.readAsDataURL(f);e.target.value="";setShowMenu(false);
  };
  const handleDoc=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=(ev)=>setAttachments(prev=>[...prev,{type:"document",name:f.name,data:ev.target.result}]);
    reader.readAsDataURL(f);e.target.value="";setShowMenu(false);
  };
  const addLink=()=>{
    const url=linkVal.trim();if(!url)return;
    setAttachments(prev=>[...prev,{type:"link",name:url,data:url}]);
    setLinkVal("");setShowLinkInput(false);setShowMenu(false);
  };
  const remove=(i)=>setAttachments(prev=>prev.filter((_,j)=>j!==i));

  const iconFor=(t)=>t==="image"?"🖼️":t==="video_file"?"🎬":t==="link"?"🔗":"📄";

  return(
    <div>
      {/* Lista de anexos */}
      {attachments.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
          {attachments.map((att,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:compact?"6px 10px":"8px 12px",borderRadius:8,background:tc.taskBg,border:`1px solid ${tc.cardBorder}`}}>
              <span style={{fontSize:14,flexShrink:0}}>{iconFor(att.type)}</span>
              <span style={{flex:1,fontSize:11,color:tc.textSub,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.name}</span>
              <button onClick={()=>remove(i)} style={{background:"none",border:"none",cursor:"pointer",padding:2,opacity:0.4,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.4"}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botão + menu */}
      <button ref={btnRef} onClick={openMenu} style={{display:"flex",alignItems:"center",gap:5,padding:compact?"5px 10px":"7px 13px",borderRadius:8,border:`1px dashed ${color}45`,background:"transparent",color:color,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F,transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background=`${color}10`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Anexar
      </button>

      {showMenu&&menuPos&&(
        <div ref={menuRef} style={{position:"fixed",top:menuPos.top,left:menuPos.left,zIndex:9999,background:tc.modalBg,border:`1px solid ${tc.cardBorder}`,borderRadius:12,padding:6,boxShadow:"0 4px 24px rgba(0,0,0,0.45)",minWidth:190,animation:"fadeIn 0.15s ease"}}>
          <button onClick={()=>mediaRef.current?.click()} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",background:"none",border:"none",cursor:"pointer",borderRadius:8,color:tc.text,fontSize:12,fontFamily:F,fontWeight:500,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=tc.inputBg} onMouseLeave={e=>e.currentTarget.style.background="none"}>📸 Foto / Vídeo</button>
          <button onClick={()=>{setShowLinkInput(true);setShowMenu(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",background:"none",border:"none",cursor:"pointer",borderRadius:8,color:tc.text,fontSize:12,fontFamily:F,fontWeight:500,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=tc.inputBg} onMouseLeave={e=>e.currentTarget.style.background="none"}>🔗 Link</button>
          <button onClick={()=>docRef.current?.click()} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",background:"none",border:"none",cursor:"pointer",borderRadius:8,color:tc.text,fontSize:12,fontFamily:F,fontWeight:500,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=tc.inputBg} onMouseLeave={e=>e.currentTarget.style.background="none"}>📄 Documento / PDF</button>
        </div>
      )}

      {/* Input de link */}
      {showLinkInput&&(
        <div style={{marginTop:8,display:"flex",gap:6,animation:"fadeIn 0.2s ease"}}>
          <input autoFocus value={linkVal} onChange={e=>setLinkVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addLink();if(e.key==="Escape")setShowLinkInput(false);}} placeholder="Cole um link (YouTube, Drive, etc.)" style={{flex:1,padding:"7px 11px",fontSize:12,borderRadius:8,background:tc.inputBg,border:`1.5px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F}}/>
          <button onClick={addLink} style={{padding:"7px 13px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F}}>OK</button>
          <button onClick={()=>{setShowLinkInput(false);setLinkVal("");}} style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${tc.cardBorder}`,background:"transparent",color:tc.textSub,fontSize:12,cursor:"pointer",fontFamily:F}}>✕</button>
        </div>
      )}

      {/* Inputs ocultos */}
      <input ref={mediaRef} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={handleMedia}/>
      <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleMedia(e)}/>
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style={{display:"none"}} onChange={handleDoc}/>
    </div>
  );
}

/* ─── Add Task (com seletor de categoria opcional) ─── */
function AddTaskInput({color,onAdd,c,projects,requireCategory,defaultDay}){
  const todayKey=WEEK_DAYS_ORDER[new Date().getDay()];
  const [isOpen,setIsOpen]=useState(false);
  const [text,setText]=useState("");
  const [description,setDescription]=useState("");
  const [day,setDay]=useState(defaultDay||todayKey);
  const [priority,setPriority]=useState("low");
  const [projectId,setProjectId]=useState(()=>projects&&projects.length>0?projects[0].id:"");
  const [attachments,setAttachments]=useState([]);
  const handleAdd=()=>{
    if(!text.trim())return;
    if(requireCategory&&!projectId)return;
    onAdd(text.trim(),day,priority,requireCategory?projectId:undefined,attachments,description.trim());
    setText("");setDescription("");setDay(defaultDay||todayKey);setPriority("low");setAttachments([]);
    setProjectId(projects&&projects.length>0?projects[0].id:"");
    setIsOpen(false);
  };
  const reset=()=>{setIsOpen(false);setText("");setDescription("");setDay(defaultDay||todayKey);setPriority("low");setAttachments([]);setProjectId(projects&&projects.length>0?projects[0].id:"");};
  const tc = c || themes.dark;
  const selectedProject = requireCategory&&projects ? projects.find(p=>p.id===projectId) : null;
  const activeColor = selectedProject ? selectedProject.color : (color||"#3B82F6");

  if(!isOpen) return(<button onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"9px 14px",borderRadius:10,cursor:"pointer",background:"transparent",border:`1px dashed ${tc.addTaskBorder}`,color:tc.addTaskColor,fontSize:13,fontWeight:500,fontFamily:F,transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=activeColor;e.currentTarget.style.color=activeColor;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=tc.addTaskBorder;e.currentTarget.style.color=tc.addTaskColor;}}>+ Nova tarefa</button>);

  return(
    <div style={{borderRadius:14,overflow:"visible",background:tc.taskBg,border:`1px solid ${activeColor}30`,animation:"fadeIn 0.2s ease"}}>
      {/* Header colorido igual ao modal */}
      <div style={{background:`linear-gradient(135deg,${activeColor}18,${activeColor}06)`,borderBottom:`1px solid ${activeColor}18`,padding:"14px 14px 12px",borderRadius:"14px 14px 0 0"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{width:22,height:22,borderRadius:6,flexShrink:0,border:`2.5px solid ${activeColor}`,background:"transparent",marginTop:3}}/>
          <div style={{flex:1,minWidth:0}}>
            <textarea autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleAdd();}if(e.key==="Escape")reset();}} placeholder="Título da tarefa..." rows={Math.max(1,text.split("\n").length)} style={{width:"100%",boxSizing:"border-box",padding:"4px 8px",fontSize:15,fontWeight:700,borderRadius:8,background:tc.inputBg,border:`1.5px solid ${activeColor}50`,color:tc.inputText,outline:"none",fontFamily:FS,resize:"none",lineHeight:1.4,overflow:"hidden"}}/>
          </div>
          <button onClick={reset} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.35,lineHeight:1,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{padding:"14px 14px 14px",display:"flex",flexDirection:"column",gap:12}}>

        {/* Descrição */}
        <div>
          <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Descrição</span>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")reset();}} placeholder="Adicione uma descrição..." rows={2} style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:13,borderRadius:10,background:tc.inputBg,border:`1.5px solid ${activeColor}30`,color:tc.inputText,outline:"none",fontFamily:F,resize:"vertical",lineHeight:1.6}}/>
        </div>

        {/* Seletor de categoria (view dias da semana) */}
        {requireCategory&&(
          <div>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Projeto</span>
            {projects&&projects.length>0?(
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {projects.map(p=>(<button key={p.id} onClick={()=>setProjectId(p.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:10,fontWeight:600,borderRadius:6,border:`1px solid ${projectId===p.id?p.color:tc.cardBorder}`,cursor:"pointer",fontFamily:F,background:projectId===p.id?`${p.color}20`:tc.inputBg,color:projectId===p.id?p.color:tc.textSub,transition:"all 0.15s"}}><span style={{fontSize:12}}>{p.emoji}</span>{p.name}</button>))}
              </div>
            ):(
              <div style={{padding:"8px 10px",borderRadius:8,background:tc.inputBg,border:`1px solid ${tc.cardBorder}`,fontSize:11,color:tc.textMuted,fontFamily:F}}>
                ⚠️ Nenhum projeto criado. Vá para a aba <strong style={{color:tc.textSub}}>Projetos</strong> e crie uma primeiro.
              </div>
            )}
          </div>
        )}

        {/* Dia + Prioridade */}
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:120}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Dia</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>setDay(d.key)} style={{padding:"4px 7px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:day===d.key?activeColor:tc.inputBg,color:day===d.key?"#fff":tc.textSub,transition:"all 0.15s"}}>{d.label}</button>))}</div>
          </div>
          <div style={{flex:1,minWidth:140}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Prioridade</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>setPriority(k)} style={{padding:"4px 10px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:priority===k?v.dot:v.bg,color:priority===k?"#fff":v.dot,transition:"all 0.15s"}}>{v.label}</button>))}</div>
          </div>
        </div>

        {/* Anexos */}
        <div>
          <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.6}}>Anexos</span>
          <AttachmentSection attachments={attachments} setAttachments={setAttachments} color={activeColor} tc={tc} compact={true}/>
        </div>

        {/* Botões */}
        <div style={{display:"flex",gap:8,paddingTop:4,borderTop:`1px solid ${tc.divider}`,marginTop:2}}>
          <button onClick={handleAdd} style={{flex:1,padding:"11px",borderRadius:11,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${activeColor},${activeColor}cc)`,color:"#fff",fontSize:13,fontWeight:700,fontFamily:F}}>Criar tarefa</button>
          <button onClick={reset} style={{padding:"11px 18px",borderRadius:11,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Week Title Editor ─── */
function WeekTitleEditor({title,defaultTitle,color,c,onSave}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(title||defaultTitle);
  const tc=c||themes.dark;
  useEffect(()=>{if(!editing)setVal(title||defaultTitle);},[title,defaultTitle,editing]);
  const handleSave=()=>{const v=val.trim()||defaultTitle;onSave(v===defaultTitle?"":v);setEditing(false);};
  const handleReset=()=>{setVal(title||defaultTitle);setEditing(false);};
  const handleClearTitle=(e)=>{e.stopPropagation();onSave("");};
  const displayTitle=title||defaultTitle;
  if(editing) return(
    <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"center",padding:"2px 0"}}
      onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();handleSave();}if(e.key==="Escape"){e.preventDefault();handleReset();}}}>
      <input autoFocus value={val} onChange={e=>setVal(e.target.value)}
        style={{flex:1,maxWidth:320,padding:"5px 10px",fontSize:15,fontWeight:600,borderRadius:8,background:tc.inputBg,border:`1px solid ${color}50`,color:tc.text,outline:"none",fontFamily:F,textAlign:"center"}}/>
      <button onMouseDown={e=>{e.preventDefault();e.stopPropagation();handleSave();}}
        style={{padding:"5px 12px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F,flexShrink:0}}>OK</button>
      <button onMouseDown={e=>{e.preventDefault();e.stopPropagation();handleReset();}}
        style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:11,cursor:"pointer",fontFamily:F,flexShrink:0}}>✕</button>
    </div>
  );
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"2px 0"}}>
      <div onClick={()=>{setVal(title||defaultTitle);setEditing(true);}} style={{textAlign:"center",cursor:"pointer",borderRadius:8,transition:"all 0.15s ease"}}
        title="Clique para editar o nome da semana"
        onMouseEnter={e=>{e.currentTarget.style.opacity="0.8";}}
        onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15,fontWeight:700,color:tc.text,fontFamily:F,letterSpacing:"0.01em"}}>{displayTitle}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{opacity:0.6,flexShrink:0}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
      </div>
      {title&&(
        <button onClick={handleClearTitle} title="Resetar nome da semana" style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",opacity:0.35,lineHeight:1,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}

/* ─── Project Card ─── */
function ProjectCard({project,onToggleTask,onUpdateTask,onDeleteTask,onAddTask,onEditProject,onDeleteProject,onRepeatToNextWeek,hasNextWeek,isExpanded,onToggleExpand,reorderMode,onMoveUp,onMoveDown,isFirst,isLast,taskMoveWeek,openTaskId,onOpen,c}){
  const done=project.tasks.filter(t=>t.done).length,total=project.tasks.length;
  const percent=total>0?Math.round((done/total)*100):0,allDone=done===total&&total>0;
  const [nameVal,setNameVal]=useState(project.name);
  const [emojiVal,setEmojiVal]=useState(project.emoji);
  const [showEdit,setShowEdit]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [showRepeatConfirm,setShowRepeatConfirm]=useState(false);
  useEffect(()=>{if(!showEdit)return;const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();setShowEdit(false);}};window.addEventListener("keydown",h,true);return()=>window.removeEventListener("keydown",h,true);},[showEdit]);
  const saveName=()=>{if(nameVal.trim()&&nameVal.trim()!==project.name)onEditProject({name:nameVal.trim()});};
  const saveEmoji=()=>{if(emojiVal.trim()&&emojiVal.trim()!==project.emoji)onEditProject({emoji:emojiVal.trim()});};
  const tc = c || themes.dark;
  return(
    <>
    {showDeleteConfirm&&<ConfirmDeleteModal title={`Excluir "${project.name}"?`} description={`Essa ação vai excluir o projeto e todas as ${total} tarefa(s) dentro dela. Essa ação não pode ser desfeita.`} onConfirm={()=>{setShowDeleteConfirm(false);onDeleteProject();}} onCancel={()=>setShowDeleteConfirm(false)} c={tc}/>}
    {showRepeatConfirm&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16,animation:"fadeIn 0.15s ease"}} onClick={()=>setShowRepeatConfirm(false)}>
        <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:tc.modalBg,border:"1px solid rgba(59,130,246,0.25)",borderRadius:18,padding:24,boxShadow:"0 8px 40px rgba(0,0,0,0.45)"}}>
          <div style={{width:44,height:44,borderRadius:12,background:"rgba(59,130,246,0.12)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </div>
          <h3 style={{fontSize:17,fontWeight:700,color:tc.text,margin:"0 0 6px",fontFamily:FS}}>Repetir tarefas?</h3>
          <p style={{fontSize:13,color:tc.textSub,margin:"0 0 6px",lineHeight:1.5,fontFamily:F}}>As <strong style={{color:tc.text}}>{total} tarefa(s)</strong> de <strong style={{color:project.color}}>{project.emoji} {project.name}</strong> serão copiadas para a <strong style={{color:tc.text}}>Próxima Semana</strong>.</p>
          <p style={{fontSize:11,color:tc.textMuted,margin:"0 0 20px",fontFamily:F}}>As tarefas já existentes na semana seguinte não serão afetadas.</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{onRepeatToNextWeek();setShowRepeatConfirm(false);setShowEdit(false);}} style={{flex:1,padding:"11px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",fontSize:13,fontWeight:700,fontFamily:F}}>Repetir</button>
            <button onClick={()=>setShowRepeatConfirm(false)} style={{padding:"11px 18px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
          </div>
        </div>
      </div>
    )}
    <div className="project-card" style={{background:tc.cardBg,borderRadius:16,border:`1px solid ${tc.cardBorder}`,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 16px 16px 20px"}}>
        {reorderMode&&(<div style={{display:"flex",flexDirection:"column",gap:2,marginRight:2}}><button onClick={onMoveUp} disabled={isFirst} style={{background:"none",border:"none",cursor:isFirst?"default":"pointer",opacity:isFirst?0.2:0.7,padding:2}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg></button><button onClick={onMoveDown} disabled={isLast} style={{background:"none",border:"none",cursor:isLast?"default":"pointer",opacity:isLast?0.2:0.7,padding:2}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg></button></div>)}
        <div onClick={onToggleExpand} style={{fontSize:28,cursor:"pointer"}}>{project.emoji}</div>
        <div style={{flex:1,cursor:"pointer"}} onClick={onToggleExpand}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:16,fontWeight:700,color:tc.text,fontFamily:F}}>{project.name}</span></div>
          <span style={{fontSize:13,color:tc.textSub,fontFamily:F}}>{done}/{total} concluídas</span>
        </div>
        <div onClick={e=>{e.stopPropagation();setShowEdit(!showEdit);}} style={{cursor:"pointer",padding:4,opacity:showEdit?1:0.4,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>{if(!showEdit)e.currentTarget.style.opacity="0.4";}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showEdit?project.color:tc.textSub} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <ProgressRing percent={percent} color={allDone?"#10B981":project.color} size={46} c={tc}/>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tc.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform 0.2s ease",transform:isExpanded?"rotate(180deg)":"rotate(0deg)",cursor:"pointer"}} onClick={onToggleExpand}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {showEdit&&(<div style={{padding:"0 16px 14px",borderTop:`1px solid ${tc.divider}`,animation:"fadeIn 0.2s ease"}}>
        <div style={{padding:"12px 0",display:"flex",flexDirection:"column",gap:10}}>
          <div><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Ícone</span><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:44,height:44,borderRadius:10,background:`${project.color}20`,border:`2px solid ${project.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{emojiVal}</div><input value={emojiVal} onChange={e=>setEmojiVal(e.target.value)} onBlur={saveEmoji} onKeyDown={e=>{if(e.key==="Enter")saveEmoji();}} placeholder="Emoji..." style={{flex:1,padding:"8px 12px",fontSize:18,borderRadius:8,background:tc.inputBg,border:`1px solid ${project.color}40`,color:tc.inputText,outline:"none",fontFamily:F,textAlign:"center"}}/></div></div>
          <div><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Nome</span><input value={nameVal} onChange={e=>setNameVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveName();}} onBlur={saveName} style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:14,borderRadius:8,background:tc.inputBg,border:`1px solid ${project.color}40`,color:tc.inputText,outline:"none",fontFamily:F}}/></div>
          <div><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Cor</span><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{COLOR_OPTIONS.map(col=>(<button key={col} onClick={()=>onEditProject({color:col})} style={{width:28,height:28,borderRadius:8,cursor:"pointer",border:project.color===col?`3px solid ${tc.text}`:"3px solid transparent",background:col}}/>))}</div></div>
          {/* Repetir tarefas para semana seguinte */}
          {hasNextWeek&&total>0&&(
            <div style={{paddingTop:4,borderTop:`1px solid ${tc.divider}`}}>
              <button onClick={()=>setShowRepeatConfirm(true)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid rgba(59,130,246,0.25)",background:"rgba(59,130,246,0.07)",color:"#3B82F6",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(59,130,246,0.14)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(59,130,246,0.07)";}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                Repetir tarefas na semana seguinte
              </button>
            </div>
          )}
          {/* Botão excluir */}
          <div style={{paddingTop:hasNextWeek&&total>0?0:4,borderTop:hasNextWeek&&total>0?"none":`1px solid ${tc.divider}`}}>
            <button onClick={()=>setShowDeleteConfirm(true)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${tc.deleteDangerBorder}`,background:tc.deleteDangerBg,color:"#EF4444",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F,transition:"all 0.2s"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Excluir projeto
            </button>
          </div>
        </div>
      </div>)}
      {isExpanded&&(<div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:6}}>{[...project.tasks].sort((a,b)=>{const done=(a.done?1:0)-(b.done?1:0);if(done!==0)return done;const d=WEEK_DAYS_ORDER.indexOf(a.day)-WEEK_DAYS_ORDER.indexOf(b.day);if(d!==0)return d;const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;return a.text.localeCompare(b.text,"pt-BR");}).map(task=>(<TaskItem key={task.id} task={task} color={project.color} projectName={project.name} projectEmoji={project.emoji} onToggle={()=>onToggleTask(project.id,task.id)} onUpdate={u=>onUpdateTask(project.id,task.id,u)} onDelete={()=>onDeleteTask(project.id,task.id)} onMoveWeek={taskMoveWeek?taskMoveWeek(project.id,task.id):null} openTaskId={openTaskId} onOpen={onOpen} c={tc}/>))}<AddTaskInput color={project.color} onAdd={(text,day,priority,_,att,desc)=>onAddTask(project.id,text,day,priority,att,desc)} c={tc}/></div>)}
    </div>
    </>
  );
}

/* ─── Add Category ─── */
function AddCategoryCard({onAdd,c}){
  const [isOpen,setIsOpen]=useState(false);const [name,setName]=useState("");const [color,setColor]=useState(COLOR_OPTIONS[0]);const [emoji,setEmoji]=useState("📌");
  const handleAdd=()=>{if(name.trim()){onAdd({name:name.trim(),color,emoji});setName("");setColor(COLOR_OPTIONS[0]);setEmoji("📌");setIsOpen(false);}};
  const tc = c || themes.dark;
  if(!isOpen) return(<button className="add-cat-btn" onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"16px",borderRadius:16,cursor:"pointer",background:"transparent",border:`2px dashed ${tc.addCatBorder}`,color:tc.addCatColor,fontSize:14,fontWeight:600,fontFamily:F}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.4)";e.currentTarget.style.color="#3B82F6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=tc.addCatBorder;e.currentTarget.style.color=tc.addCatColor;}}>+ Novo Projeto</button>);
  return(<div style={{background:tc.cardBg,borderRadius:16,border:`1px solid ${tc.cardBorder}`,padding:20,animation:"fadeIn 0.2s ease"}}><span style={{fontSize:14,fontWeight:700,color:tc.text,fontFamily:F,display:"block",marginBottom:14}}>Novo Projeto</span><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Ícone</span><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:48,height:48,borderRadius:12,background:`${color}20`,border:`2px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{emoji}</div><input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder="Cole um emoji..." style={{flex:1,padding:"10px 12px",fontSize:18,borderRadius:10,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,textAlign:"center"}}/></div><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Nome</span><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Nome do projeto..." style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:14,borderRadius:10,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,marginBottom:12}}/><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Cor</span><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>{COLOR_OPTIONS.map(col=>(<button key={col} onClick={()=>setColor(col)} style={{width:28,height:28,borderRadius:8,border:color===col?`3px solid ${tc.text}`:"3px solid transparent",background:col,cursor:"pointer"}}/>))}</div><div style={{display:"flex",gap:8}}><button onClick={handleAdd} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:color,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Criar</button><button onClick={()=>setIsOpen(false)} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.cancelColor,fontSize:14,cursor:"pointer",fontFamily:F}}>Cancelar</button></div></div>);
}

/* ─── History Card ─── */
function HistoryCard({record,onDelete,c,themeMode,viewMode}){
  const [expanded,setExpanded]=useState(false);
  const dateStr=new Date(record.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
  const tc = c || themes.dark;
  const byDay=viewMode==="weekday";

  const handlePrint=useCallback((e)=>{
    e.stopPropagation();
    const isLight=themeMode==="light";
    const logoFile=isLight?"logo-light.svg":"logo.svg";
    const logoUrl=window.location.origin+import.meta.env.BASE_URL+logoFile;

    let rows="";
    if(byDay){
      // Agrupa todas as tarefas por dia da semana
      const allTasks=record.projects.flatMap(p=>p.tasks.map(t=>({...t,_emoji:p.emoji,_name:p.name,_color:p.color})));
      rows=WEEK_DAYS.map(d=>{
        const tasks=allTasks.filter(t=>t.day===d.key);
        if(tasks.length===0)return"";
        const taskRows=tasks.map(t=>`<tr><td style="padding:6px 12px 6px 36px;font-size:13px;color:#374151;border-bottom:1px solid #F3F4F6;">${t._emoji} ${t.text}</td><td style="padding:6px 12px;font-size:11px;border-bottom:1px solid #F3F4F6;white-space:nowrap;text-align:right;"><span style="background:${t._color}18;color:${t._color};padding:1px 6px;border-radius:4px;font-weight:600;">${t._name}</span></td></tr>`).join("");
        return`<tr><td colspan="2" style="padding:12px 12px 6px;font-size:12px;font-weight:700;color:#374151;letter-spacing:0.3px;border-bottom:1px solid #E5E7EB;background:#F9FAFB;">${d.label} — ${d.full} <span style="font-weight:400;color:#9CA3AF;font-size:11px;">(${tasks.length})</span></td></tr>${taskRows}`;
      }).join("");
    } else {
      // Agrupa por projeto
      rows=record.projects.map(p=>{
        const tasks=p.tasks.map(t=>{
          const di=WEEK_DAYS.find(d=>d.key===t.day);
          return`<tr><td style="padding:6px 12px 6px 36px;font-size:13px;color:#374151;border-bottom:1px solid #F3F4F6;">${t.text}</td><td style="padding:6px 12px;font-size:11px;color:#6B7280;text-align:right;border-bottom:1px solid #F3F4F6;white-space:nowrap;">${di?di.label:""}</td></tr>`;
        }).join("");
        return`<tr><td colspan="2" style="padding:12px 12px 6px;font-size:12px;font-weight:700;color:${p.color};letter-spacing:0.3px;border-bottom:1px solid #E5E7EB;">${p.emoji} ${p.name} <span style="font-weight:400;color:#9CA3AF;font-size:11px;">(${p.tasks.length})</span></td></tr>${tasks}`;
      }).join("");
    }

    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório — ${record.week}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',system-ui,sans-serif;background:#fff;color:#111827;padding:40px;}@media print{body{padding:20px;}@page{margin:20mm;}}</style></head><body>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #E5E7EB;margin-bottom:28px;">
        <img src="${logoUrl}" style="height:36px;" onerror="this.style.display='none'"/>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:#111827;">${record.week}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px;">Concluída em ${dateStr}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="width:28px;height:28px;border-radius:8px;background:#D1FAE5;display:flex;align-items:center;justify-content:center;font-size:14px;">✓</div>
        <div><div style="font-size:15px;font-weight:700;color:#111827;">Tarefas concluídas${byDay?" · por dia":""}</div><div style="font-size:12px;color:#6B7280;">${record.total} tarefa${record.total!==1?"s":""} no total</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">${rows}</table>
    </body></html>`;

    const win=window.open("","_blank","width=750,height=900");
    if(!win)return;
    win.document.write(html);
    win.document.close();
    win.onload=()=>{ win.focus(); win.print(); };
  },[record,dateStr,byDay,themeMode]);

  return(
    <div className="project-card" style={{background:tc.cardBg,borderRadius:14,border:`1px solid ${tc.cardBorder}`,overflow:"hidden"}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",cursor:"pointer",userSelect:"none"}}>
        <div style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:tc.historyIconBg,fontSize:16,color:tc.historyIconColor}}>✓</div>
        <div style={{flex:1}}><span style={{fontSize:13,fontWeight:700,color:tc.text,fontFamily:F,display:"block"}}>{record.week}</span><span style={{fontSize:11,color:tc.textMuted,fontFamily:F}}>{dateStr} — {record.total} tarefas</span></div>
        <div onClick={handlePrint} title="Imprimir relatório" style={{cursor:"pointer",padding:4,opacity:0.3,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.3"}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></div>
        <div onClick={e=>{e.stopPropagation();if(confirm("Apagar este registro?"))onDelete();}} style={{cursor:"pointer",padding:4,opacity:0.3,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.3"}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tc.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform 0.2s ease",transform:expanded?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {expanded&&(<div style={{padding:"0 16px 14px",display:"flex",flexDirection:"column",gap:8,animation:"fadeIn 0.2s ease"}}>{record.projects.map((p,j)=>(<div key={j}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:16}}>{p.emoji}</span><span style={{fontSize:12,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span><span style={{fontSize:10,color:tc.textMuted,fontFamily:F}}>({p.tasks.length})</span></div><div style={{display:"flex",flexDirection:"column",gap:3,paddingLeft:28}}>{p.tasks.map((t,k)=>{const di=WEEK_DAYS.find(d=>d.key===t.day);return(<div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{flex:1,fontSize:12,color:tc.textSub,fontFamily:F}}>{t.text}</span>{di&&<span style={{fontSize:9,color:tc.textMuted,fontFamily:F,padding:"1px 5px",background:tc.tagBg,borderRadius:4}}>{di.label}</span>}</div>);})}</div></div>))}</div>)}
    </div>
  );
}

/* ─── Column Project Card ─── */
function ColumnProjectCard({project:p,done,total,pct,idx,projectsLen,reorderMode,onMoveProject,onEditProject,onDeleteProject,onToggleTask,onUpdateTask,onDeleteTask,onAddTask,taskMoveWeekFn,openTaskId,onOpen,c}){
  const [showEdit,setShowEdit]=useState(false);
  const [nameVal,setNameVal]=useState(p.name);
  const [emojiVal,setEmojiVal]=useState(p.emoji);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  useEffect(()=>{if(!showEdit)return;const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();setShowEdit(false);}};window.addEventListener("keydown",h,true);return()=>window.removeEventListener("keydown",h,true);},[showEdit]);
  const saveName=()=>{if(nameVal.trim()&&nameVal.trim()!==p.name)onEditProject({name:nameVal.trim()});};
  const saveEmoji=()=>{if(emojiVal.trim()&&emojiVal.trim()!==p.emoji)onEditProject({emoji:emojiVal.trim()});};
  const tc = c || themes.dark;
  return(
    <>
    {showDeleteConfirm&&<ConfirmDeleteModal title={`Excluir "${p.name}"?`} description={`Essa ação vai excluir o projeto e todas as ${total} tarefa(s). Não pode ser desfeita.`} onConfirm={()=>{setShowDeleteConfirm(false);onDeleteProject();}} onCancel={()=>setShowDeleteConfirm(false)} c={tc}/>}
    <div style={{background:tc.cardBg,borderRadius:14,border:`1px solid ${tc.cardBorder}`,overflow:"hidden",minWidth:180}}>
      <div style={{padding:"14px 12px",borderBottom:`1px solid ${tc.colDayDivider}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20}}>{p.emoji}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:tc.text,fontFamily:F,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div><span style={{fontSize:11,color:tc.textSub,fontFamily:F}}>{done}/{total}</span></div>
          <div onClick={()=>setShowEdit(!showEdit)} style={{cursor:"pointer",padding:4,opacity:showEdit?1:0.4,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>{if(!showEdit)e.currentTarget.style.opacity="0.4";}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={showEdit?p.color:tc.textSub} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <ProgressRing percent={pct} color={pct===100?"#10B981":p.color} size={32} c={tc}/>
        </div>
        {showEdit&&(<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8,animation:"fadeIn 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:36,height:36,borderRadius:8,background:`${p.color}20`,border:`1px solid ${p.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{emojiVal}</div><input value={emojiVal} onChange={e=>setEmojiVal(e.target.value)} onBlur={saveEmoji} onKeyDown={e=>{if(e.key==="Enter")saveEmoji();}} style={{width:50,padding:"4px 6px",fontSize:16,borderRadius:6,background:tc.inputBg,border:`1px solid ${p.color}40`,color:tc.inputText,outline:"none",fontFamily:F,textAlign:"center"}}/></div>
          <input value={nameVal} onChange={e=>setNameVal(e.target.value)} onBlur={saveName} onKeyDown={e=>{if(e.key==="Enter")saveName();}} style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",fontSize:12,borderRadius:6,background:tc.inputBg,border:`1px solid ${p.color}40`,color:tc.inputText,outline:"none",fontFamily:F}}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{COLOR_OPTIONS.map(col=>(<button key={col} onClick={()=>onEditProject({color:col})} style={{width:22,height:22,borderRadius:6,cursor:"pointer",border:p.color===col?`2px solid ${tc.text}`:"2px solid transparent",background:col}}/>))}</div>
          <button onClick={()=>setShowDeleteConfirm(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,border:`1px solid ${tc.deleteDangerBorder}`,background:tc.deleteDangerBg,color:"#EF4444",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Excluir projeto
          </button>
        </div>)}
        {reorderMode&&(<div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8}}>
          <button onClick={()=>onMoveProject(idx,-1)} disabled={idx===0} style={{background:"none",border:`1px solid ${tc.reorderBorder}`,borderRadius:6,cursor:idx===0?"default":"pointer",opacity:idx===0?0.2:0.7,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,color:tc.textSub,fontSize:10,fontFamily:F}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>←</button>
          <button onClick={()=>onMoveProject(idx,1)} disabled={idx===projectsLen-1} style={{background:"none",border:`1px solid ${tc.reorderBorder}`,borderRadius:6,cursor:idx===projectsLen-1?"default":"pointer",opacity:idx===projectsLen-1?0.2:0.7,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,color:tc.textSub,fontSize:10,fontFamily:F}}>→<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>)}
      </div>
      <div style={{padding:"8px 8px 12px",display:"flex",flexDirection:"column",gap:5}}>
        {[...p.tasks].sort((a,b)=>{const done=(a.done?1:0)-(b.done?1:0);if(done!==0)return done;const d=WEEK_DAYS_ORDER.indexOf(a.day)-WEEK_DAYS_ORDER.indexOf(b.day);if(d!==0)return d;const o={high:0,medium:1,low:2};const pr=o[a.priority]-o[b.priority];if(pr!==0)return pr;return a.text.localeCompare(b.text,"pt-BR");}).map(task=>(<TaskItem key={task.id} task={task} color={p.color} projectName={p.name} projectEmoji={p.emoji} onToggle={()=>onToggleTask(p.id,task.id)} onUpdate={u=>onUpdateTask(p.id,task.id,u)} onDelete={()=>onDeleteTask(p.id,task.id)} onMoveWeek={taskMoveWeekFn(p.id,task.id)} openTaskId={openTaskId} onOpen={onOpen} c={tc}/>))}
        <AddTaskInput color={p.color} onAdd={(text,day,priority,_,att,desc)=>onAddTask(p.id,text,day,priority,att,desc)} c={tc}/>
      </div>
    </div>
    </>
  );
}

/* ─── User Settings Modal ─── */
function UserSettingsModal({userName,profile,onSave,onClose,c}){
  const tc=c||themes.dark;
  const [displayName,setDisplayName]=useState(profile.displayName||userName);
  const [photoURL,setPhotoURL]=useState(profile.photoURL||"");
  const [saving,setSaving]=useState(false);
  // Crop state
  const [cropSrc,setCropSrc]=useState(null);
  const [cropScale,setCropScale]=useState(1);
  const [cropOffset,setCropOffset]=useState({x:0,y:0});
  const [dragging,setDragging]=useState(false);
  const [dragStart,setDragStart]=useState(null);
  const canvasRef=useRef(null);
  const imgRef=useRef(null);
  const SIZE=220;

  useEffect(()=>{
    const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();if(cropSrc){setCropSrc(null);}else{onClose();}}};
    window.addEventListener("keydown",h,true);
    return()=>window.removeEventListener("keydown",h,true);
  },[cropSrc,onClose]);

  // Draw crop preview
  useEffect(()=>{
    if(!cropSrc||!canvasRef.current)return;
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    const img=imgRef.current;
    if(!img||!img.complete)return;
    ctx.clearRect(0,0,SIZE,SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2);
    ctx.clip();
    const w=img.naturalWidth*cropScale;
    const h=img.naturalHeight*cropScale;
    ctx.drawImage(img,(SIZE-w)/2+cropOffset.x,(SIZE-h)/2+cropOffset.y,w,h);
    ctx.restore();
  },[cropSrc,cropScale,cropOffset]);

  const handleFileChange=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{setCropSrc(ev.target.result);setCropScale(1);setCropOffset({x:0,y:0});};
    reader.readAsDataURL(f);
    e.target.value="";
  };

  const handleWheel=(e)=>{e.preventDefault();setCropScale(s=>Math.min(4,Math.max(0.3,s-e.deltaY*0.002)));};
  const handleMouseDown=(e)=>{e.preventDefault();setDragging(true);setDragStart({x:e.clientX-cropOffset.x,y:e.clientY-cropOffset.y});};
  const handleMouseMove=(e)=>{if(!dragging||!dragStart)return;setCropOffset({x:e.clientX-dragStart.x,y:e.clientY-dragStart.y});};
  const handleMouseUp=()=>{setDragging(false);setDragStart(null);};
  const handleTouchStart=(e)=>{const t=e.touches[0];setDragging(true);setDragStart({x:t.clientX-cropOffset.x,y:t.clientY-cropOffset.y});};
  const handleTouchMove=(e)=>{if(!dragging||!dragStart)return;const t=e.touches[0];setCropOffset({x:t.clientX-dragStart.x,y:t.clientY-dragStart.y});};

  const applyCrop=()=>{
    if(!canvasRef.current)return;
    const url=canvasRef.current.toDataURL("image/jpeg",0.85);
    setPhotoURL(url);setCropSrc(null);
  };

  const handleSave=async()=>{
    setSaving(true);
    await onSave({displayName:displayName.trim()||userName,photoURL});
    setSaving(false);onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:16,animation:"fadeIn 0.2s ease"}}>
      <div style={{width:"100%",maxWidth:420,background:tc.modalBg,border:`1px solid ${tc.cardBorder}`,borderRadius:22,boxShadow:"0 12px 56px rgba(0,0,0,0.5)",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"20px 20px 16px",borderBottom:`1px solid ${tc.divider}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"rgba(59,130,246,0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span style={{fontSize:16,fontWeight:700,color:tc.text,fontFamily:FS}}>Configurações do Perfil</span>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",opacity:0.4,padding:4}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.4"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Crop view */}
        {cropSrc&&(
          <div style={{padding:24}}>
            <p style={{fontSize:12,color:tc.textMuted,fontFamily:F,margin:"0 0 12px",textAlign:"center"}}>Arraste para reposicionar · Scroll para zoom</p>
            <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
              <canvas ref={canvasRef} width={SIZE} height={SIZE}
                style={{borderRadius:"50%",border:`3px solid ${tc.cardBorder}`,cursor:dragging?"grabbing":"grab",touchAction:"none",userSelect:"none"}}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}
                onWheel={handleWheel}
              />
              <img ref={imgRef} src={cropSrc} alt="" style={{display:"none"}} onLoad={()=>{
                if(!canvasRef.current||!imgRef.current)return;
                const img=imgRef.current;
                const scaleToFit=Math.max(SIZE/img.naturalWidth,SIZE/img.naturalHeight);
                setCropScale(scaleToFit);setCropOffset({x:0,y:0});
                // trigger redraw
                setTimeout(()=>setCropOffset(o=>({...o})),50);
              }}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span style={{fontSize:11,color:tc.textMuted,fontFamily:F}}>🔍</span>
              <input type="range" min="0.3" max="4" step="0.01" value={cropScale} onChange={e=>setCropScale(parseFloat(e.target.value))} style={{flex:1,accentColor:"#3B82F6"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={applyCrop} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>Usar esta foto</button>
              <button onClick={()=>setCropSrc(null)} style={{padding:"11px 16px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,cursor:"pointer",fontFamily:F}}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Main settings */}
        {!cropSrc&&(<div style={{padding:24,display:"flex",flexDirection:"column",gap:20}}>
          {/* Avatar */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{position:"relative"}}>
              {photoURL?(
                <img src={photoURL} alt="avatar" style={{width:88,height:88,borderRadius:"50%",objectFit:"cover",border:`3px solid ${tc.cardBorder}`}}/>
              ):(
                <div style={{width:88,height:88,borderRadius:"50%",background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",border:`3px solid ${tc.cardBorder}`}}>
                  <span style={{fontSize:34,fontWeight:800,color:"#fff",fontFamily:FS}}>{(displayName||userName).charAt(0).toUpperCase()}</span>
                </div>
              )}
              <label style={{position:"absolute",bottom:0,right:0,width:28,height:28,borderRadius:"50%",background:"#3B82F6",border:`2px solid ${tc.modalBg}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleFileChange}/>
              </label>
            </div>
            {photoURL&&<button onClick={()=>setPhotoURL("")} style={{fontSize:11,color:"#EF4444",background:"none",border:"none",cursor:"pointer",fontFamily:F,opacity:0.7}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>Remover foto</button>}
          </div>

          {/* Display name */}
          <div>
            <label style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5,fontFamily:F}}>Nome de exibição</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSave()} placeholder={userName} style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",fontSize:14,borderRadius:10,background:tc.inputBg,border:`1px solid ${tc.inputBorder}`,color:tc.inputText,outline:"none",fontFamily:F}}/>
            <p style={{fontSize:11,color:tc.textMuted,margin:"6px 0 0",fontFamily:F}}>Aparece no "Olá..." do cabeçalho. Login permanece: <strong style={{color:tc.textSub}}>{userName}</strong></p>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:8,paddingTop:4}}>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",fontSize:13,fontWeight:700,cursor:saving?"default":"pointer",fontFamily:F,opacity:saving?0.7:1}}>
              {saving?"Salvando...":"Salvar"}
            </button>
            <button onClick={onClose} style={{padding:"11px 18px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.textSub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button>
          </div>
        </div>)}
      </div>
    </div>
  );
}

/* ─── Changelog (editar aqui para adicionar novidades) ─── */
const CHANGELOG = [
  {
    version: "v2.31",
    date: "09/03/2026",
    badge: "novo",
    title: "Login simplificado & painel admin completo",
    items: [
      "🔐 Login agora é feito só com e-mail e senha — sem campo de usuário",
      "✨ Criação de conta simplificada: só nome e senha (username gerado automaticamente)",
      "👤 Nome exibido no app (\"Olá, Déa\") definido na criação — independente do login",
      "🛡️ Painel Admin mostra usuários ativos com status de último acesso em tempo real",
      "📋 Convites pendentes separados de usuários já cadastrados no Admin",
      "🗑️ Admin pode excluir usuário e reenviar convite com um clique",
      "🌐 Domínio migrado para plannersemanal.com",
      "📌 Destaque de novidades agora com cor roxa",
      "🔗 Logo aparece na tela de \"Esqueceu a senha?\"",
      "🐛 Fix: link de reset de senha agora aponta para plannersemanal.com",
      "🐛 Fix: após redefinir senha, sessão é encerrada para forçar novo login",
    ],
  },
  {
    version: "v2.20",
    date: "09/03/2025",
    badge: "novo",
    title: "Novidades fixadas em destaque",
    items: [
      "Admin pode fixar qualquer novidade para aparecer em destaque para todos os usuários",
      "Item fixado aparece no topo do modal com borda âmbar e badge 📌",
      "Admin pode desafixar a qualquer momento com um clique",
    ],
  },
  {
    version: "v2.19",
    date: "09/03/2025",
    badge: "novo",
    title: "Relatório semanal em PDF",
    items: [
      "📊 Gere um relatório visual da sua semana com um clique no header",
      "Escolha view por Projetos ou Dias da Semana, semana atual, próxima ou ambas",
      "Tarefas concluídas aparecem riscadas; inclua ou não os anexos",
      "Relatório abre em nova aba com o tema do app — salve como PDF com Ctrl+P",
    ],
  },
  {
    version: "v2.17",
    date: "09/03/2025",
    badge: "novo",
    title: "Anexos nas tarefas",
    items: [
      "📸 Anexe fotos e vídeos diretamente nas tarefas",
      "🔗 Cole links do YouTube, Google Drive, Vimeo ou Loom — o vídeo abre incorporado no pop-up",
      "📄 Faça upload de documentos e PDFs — PDFs abrem direto no modal",
      "Anexos também disponíveis ao criar uma nova tarefa",
    ],
  },
  {
    version: "v2.16",
    date: "09/03/2025",
    badge: "novo",
    title: "Edição completa no pop-up da tarefa",
    items: [
      "Botão de edição ✏️ diretamente no modal de visualização da tarefa",
      "Ao editar, o modal só fecha pelo X, Salvar ou Cancelar — sem fechar por acidente",
      "Campos editáveis: título, descrição, dia da semana e prioridade",
    ],
  },
  {
    version: "v2.15",
    date: "Março 2025",
    badge: "melhoria",
    title: "Login com Google & perfil de usuário",
    items: [
      "Entre com sua conta Google com um clique",
      "Foto de perfil automática via Google, com opção de trocar por foto própria",
      "Crop circular interativo para ajustar a foto de perfil",
      "Nome de exibição personalizável",
    ],
  },
  {
    version: "v2.14",
    date: "Março 2025",
    badge: "melhoria",
    title: "Painel de Admin & convites",
    items: [
      "Admin pode convidar novos usuários por e-mail",
      "Novos usuários recebem e-mail de convite e podem criar conta própria",
      "Sistema de reset de senha por e-mail",
    ],
  },
  {
    version: "v2.10",
    date: "Fevereiro 2025",
    badge: "melhoria",
    title: "Drag & drop e melhorias de UX",
    items: [
      "Arraste tarefas entre dias da semana na view Colunas",
      "Layout Colunas para tablet e desktop",
      "Focos da semana: destaque para tarefas de alta prioridade",
      "Reordenar projetos sincronizado entre semanas",
    ],
  },
  {
    version: "v2.0",
    date: "Janeiro 2025",
    badge: "lançamento",
    title: "Lançamento do Planner Semanal 🎉",
    items: [
      "Sistema de semanas com Semana Atual e Próxima Semana",
      "Views por Categorias e Dias da Semana",
      "Tarefas com prioridade, dia, descrição e edição inline",
      "Histórico de semanas concluídas",
      "Tema dark e light",
      "Multi-usuário com login por PIN",
    ],
  },
  {
    version: "Guia",
    date: "Março 2025",
    badge: "boas-vindas",
    isWelcome: true,
    title: "Bem-vindo ao Planner Semanal 👋",
    items: [
      "🗂️ Organize sua semana em Projetos ou por Dias da Semana",
      "✅ Crie tarefas com prioridade, dia, descrição e anexos (foto, vídeo, link, PDF)",
      "⚡ Acompanhe seus Focos da Semana — tarefas de alta prioridade em destaque",
      "📊 Gere relatórios visuais da sua semana em PDF com um clique",
      "🔄 Planeje a próxima semana sem perder o foco no presente",
    ],
  },
];

const WHATS_NEW_STORAGE_KEY = "whats-new-last-seen";
const WHATS_NEW_PINNED_KEY  = "whats-new-pinned";

/* ─── WhatsNew Modal ─── */
function WhatsNewModal({onClose,c,onMarkSeen,isAdmin}){
  const tc=c||themes.dark;
  const [showAll,setShowAll]=useState(false);
  const [pinnedVersion,setPinnedVersion]=useState(null);
  const [savingPin,setSavingPin]=useState(false);

  // Carregar pin do Firestore
  useEffect(()=>{
    onMarkSeen();
    window.storage.get(WHATS_NEW_PINNED_KEY).then(r=>{
      if(r&&r.value)setPinnedVersion(JSON.parse(r.value));
    }).catch(()=>{});
    const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();onClose();}};
    window.addEventListener("keydown",h,true);
    return()=>window.removeEventListener("keydown",h,true);
  },[]);

  const handlePin=async(version)=>{
    setSavingPin(version);
    const newVal=pinnedVersion===version?null:version;
    try{
      if(newVal)await window.storage.set(WHATS_NEW_PINNED_KEY,JSON.stringify(newVal));
      else await window.storage.delete(WHATS_NEW_PINNED_KEY);
      setPinnedVersion(newVal);
    }catch{}
    setSavingPin(false);
  };

  const badgeColors={
    novo:{bg:"rgba(16,185,129,0.15)",color:"#10B981",label:"Novo"},
    melhoria:{bg:"rgba(59,130,246,0.12)",color:"#3B82F6",label:"Melhoria"},
    lançamento:{bg:"rgba(245,158,11,0.15)",color:"#F59E0B",label:"Lançamento"},
    fix:{bg:"rgba(239,68,68,0.1)",color:"#EF4444",label:"Fix"},
    "boas-vindas":{bg:"rgba(16,185,129,0.15)",color:"#10B981",label:"Guia"},
  };

  const openGuide=()=>{
    const isDark=tc===themes.dark||(tc&&tc.bg==="#0B1120");
    const themeParam=isDark?"dark":"light";
    window.open(`/guia-usuario?theme=${themeParam}`,'_blank');
  };

  const pinnedEntry=pinnedVersion?CHANGELOG.find(e=>e.version===pinnedVersion):null;
  const regularList=showAll?CHANGELOG:CHANGELOG.slice(0,3);

  const renderEntry=(entry,i,{isLatest=false,isPinned=false}={})=>{
    const bc=badgeColors[entry.badge]||badgeColors.melhoria;
    const isPinnedThis=pinnedVersion===entry.version;
    return(
      <div key={entry.version+(isPinned?"_pin":"")} style={{position:"relative",paddingLeft:isPinned?0:20}}>
        {/* linha vertical */}
        {!isPinned&&i<regularList.length-1&&<div style={{position:"absolute",left:6,top:28,bottom:-20,width:1,background:tc.divider}}/>}
        {/* dot */}
        {!isPinned&&<div style={{position:"absolute",left:0,top:6,width:13,height:13,borderRadius:"50%",background:isLatest?"linear-gradient(135deg,#3B82F6,#8B5CF6)":tc.inputBg,border:isLatest?"none":`1.5px solid ${tc.cardBorder}`,boxShadow:isLatest?"0 0 0 3px rgba(59,130,246,0.2)":"none"}}/>}
        <div style={{background:isPinned?"linear-gradient(135deg,rgba(139,92,246,0.08),rgba(109,40,217,0.04))":isLatest?`linear-gradient(135deg,rgba(59,130,246,0.06),rgba(139,92,246,0.04))`:tc.taskBg,border:`1px solid ${isPinned?"rgba(139,92,246,0.3)":isLatest?"rgba(59,130,246,0.2)":tc.cardBorder}`,borderRadius:14,padding:"14px 16px",animation:"fadeIn 0.3s ease"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,background:bc.bg,color:bc.color,fontFamily:F,textTransform:"uppercase",letterSpacing:"0.05em"}}>{bc.label}</span>
            <span style={{fontSize:11,fontWeight:700,color:tc.textSub,fontFamily:F}}>{entry.version}</span>
            <span style={{fontSize:10,color:tc.textMuted,fontFamily:F,marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              {entry.date}
              {isAdmin&&!isPinned&&(
                <button onClick={()=>handlePin(entry.version)} disabled={!!savingPin} title={isPinnedThis?"Desafixar":"Fixar esta novidade para todos"} style={{background:isPinnedThis?"rgba(245,158,11,0.15)":"none",border:`1px solid ${isPinnedThis?"rgba(245,158,11,0.4)":tc.cardBorder}`,borderRadius:6,cursor:"pointer",padding:"2px 6px",display:"inline-flex",alignItems:"center",gap:4,fontSize:9,fontWeight:700,color:isPinnedThis?"#F59E0B":tc.textMuted,fontFamily:F,transition:"all 0.15s",opacity:savingPin===entry.version?0.5:1}} onMouseEnter={e=>{if(!isPinnedThis){e.currentTarget.style.borderColor="rgba(245,158,11,0.4)";e.currentTarget.style.color="#F59E0B";e.currentTarget.style.background="rgba(245,158,11,0.1)";}}} onMouseLeave={e=>{if(!isPinnedThis){e.currentTarget.style.borderColor=tc.cardBorder;e.currentTarget.style.color=tc.textMuted;e.currentTarget.style.background="none";}}}>
                  {isPinnedThis?"📌 Fixado":"📌 Fixar"}
                </button>
              )}
            </span>
          </div>
          <h3 style={{margin:"0 0 10px",fontSize:14,fontWeight:700,color:tc.text,fontFamily:FS,lineHeight:1.3}}>{entry.title}</h3>
          <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:5}}>
            {entry.items.map((item,j)=>(
              <li key={j} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,color:tc.textSub,fontFamily:F,lineHeight:1.5}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isPinned?"#8B5CF6":"#3B82F6"} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0,marginTop:2}}><polyline points="20 6 9 17 4 12"/></svg>
                {item}
              </li>
            ))}
          </ul>
          {/* Botão Guia Completo */}
          {entry.isWelcome&&(
            <button onClick={(e)=>{e.stopPropagation();openGuide();}} style={{marginTop:12,width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(16,185,129,0.35)",background:"rgba(16,185,129,0.08)",color:"#10B981",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",gap:7,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(16,185,129,0.15)";e.currentTarget.style.borderColor="rgba(16,185,129,0.55)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(16,185,129,0.08)";e.currentTarget.style.borderColor="rgba(16,185,129,0.35)";}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              📖 Ver Guia Completo
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft:2}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
          )}
          {/* Botão de desafixar só no card pinado, visível apenas para admin */}
          {isPinned&&isAdmin&&(
            <button onClick={()=>handlePin(entry.version)} disabled={!!savingPin} style={{marginTop:10,padding:"5px 12px",borderRadius:7,border:"1px solid rgba(139,92,246,0.3)",background:"rgba(139,92,246,0.08)",color:"#8B5CF6",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(139,92,246,0.16)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(139,92,246,0.08)"}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Desafixar
            </button>
          )}
        </div>
      </div>
    );
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(5px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:16,animation:"fadeIn 0.2s ease"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"85vh",background:tc.modalBg,border:"1px solid rgba(59,130,246,0.2)",borderRadius:22,boxShadow:"0 8px 50px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"22px 24px 16px",borderBottom:`1px solid ${tc.divider}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.2))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div style={{flex:1}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:800,color:tc.text,fontFamily:FS}}>Novidades</h2>
              <p style={{margin:0,fontSize:12,color:tc.textMuted,fontFamily:F}}>Atualizações do Planner Semanal{isAdmin&&<span style={{marginLeft:8,fontSize:10,padding:"1px 6px",borderRadius:4,background:"rgba(139,92,246,0.15)",color:"#A78BFA",fontWeight:700}}>Admin</span>}</p>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.35}} onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Lista */}
        <div style={{overflowY:"auto",flex:1,padding:"16px 24px"}}>

          {/* Card fixado (visível para TODOS se existir) */}
          {pinnedEntry&&(
            <div style={{marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:10,fontWeight:700,color:"#8B5CF6",fontFamily:F,textTransform:"uppercase",letterSpacing:"0.06em"}}>📌 Em destaque</span>
                <div style={{flex:1,height:1,background:"rgba(139,92,246,0.2)"}}/>
              </div>
              {renderEntry(pinnedEntry,0,{isPinned:true})}
              <div style={{height:1,background:tc.divider,margin:"20px 0"}}/>
            </div>
          )}

          {/* Timeline normal */}
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {regularList.map((entry,i)=>renderEntry(entry,i,{isLatest:i===0&&!pinnedEntry}))}
          </div>

          {/* Ver mais */}
          {!showAll&&CHANGELOG.length>3&&(
            <button onClick={()=>setShowAll(true)} style={{width:"100%",marginTop:16,padding:"10px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.btnBg,color:tc.textSub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.4)";e.currentTarget.style.color="#3B82F6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=tc.cardBorder;e.currentTarget.style.color=tc.textSub;}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              Ver todas as atualizações ({CHANGELOG.length - 3} mais antigas)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Report Generator ─── */
function ReportModal({weeks,onClose,c,theme,userProfile,userName,initialViewType}){
  const tc=c||themes.dark;
  const isDark=theme.mode==="dark";
  const [viewType,setViewType]=useState(initialViewType||"projects"); // projects | days
  const [weekSel,setWeekSel]=useState("current"); // current | next | both
  const [includeAttachments,setIncludeAttachments]=useState(false);
  const [generating,setGenerating]=useState(false);

  useEffect(()=>{
    const h=(e)=>{if(e.key==="Escape"){e.stopPropagation();onClose();}};
    window.addEventListener("keydown",h,true);
    return()=>window.removeEventListener("keydown",h,true);
  },[]);

  const fmtDate=(isoSun,isoSat)=>{
    if(!isoSun)return"";
    const sun=new Date(isoSun),sat=new Date(isoSat||isoSun);
    const pad=n=>String(n).padStart(2,"0");
    const MONTHS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${pad(sun.getDate())} ${MONTHS[sun.getMonth()]} – ${pad(sat.getDate())} ${MONTHS[sat.getMonth()]} ${sat.getFullYear()}`;
  };

  const prio={"high":{label:"Alta",color:"#EF4444"},"medium":{label:"Média",color:"#F59E0B"},"low":{label:"Baixa",color:"#6B7280"}};

  const buildHTML=()=>{
    const weeksToRender=weekSel==="both"?weeks:(weekSel==="current"?[weeks[0]]:[weeks[1]]).filter(Boolean);
    const logoUrl=isDark?`${window.location.origin}${import.meta.env.BASE_URL||"/"}logo.svg`:`${window.location.origin}${import.meta.env.BASE_URL||"/"}logo-light.svg`;
    const bg=isDark?"#0B1120":"#F8FAFC";
    const cardBg=isDark?"rgba(255,255,255,0.04)":"#fff";
    const border=isDark?"rgba(255,255,255,0.07)":"#E2E8F0";
    const textMain=isDark?"#F1F5F9":"#0F172A";
    const textSub=isDark?"#94A3B8":"#475569";
    const textMuted=isDark?"#64748B":"#94A3B8";
    const taskDoneBg=isDark?"rgba(255,255,255,0.02)":"#F8FAFC";
    const now=new Date();
    const displayName=userProfile?.displayName||userName||"";

    const renderAttachment=(att)=>{
      if(!includeAttachments)return"";
      if(att.type==="image")return`<div style="margin-top:8px;border-radius:8px;overflow:hidden;border:1px solid ${border}"><img src="${att.data}" style="width:100%;max-height:200px;object-fit:cover;display:block;" /></div>`;
      if(att.type==="video_file")return`<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:${cardBg};border:1px solid ${border};display:flex;align-items:center;gap:8px;font-size:11px;color:${textSub};">🎬 ${att.name}</div>`;
      if(att.type==="link"){
        const embed=getVideoEmbed(att.data);
        if(embed)return`<div style="margin-top:8px;border-radius:8px;overflow:hidden;border:1px solid ${border}"><iframe src="${embed}" style="width:100%;height:160px;border:none;display:block;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
        return`<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:${cardBg};border:1px solid ${border};font-size:11px;"><a href="${att.data}" style="color:#3B82F6;text-decoration:none;">🔗 ${att.data}</a></div>`;
      }
      if(att.type==="document"){
        if(att.data.startsWith("data:application/pdf"))return`<div style="margin-top:8px;border-radius:8px;overflow:hidden;border:1px solid ${border}"><iframe src="${att.data}" style="width:100%;height:180px;border:none;display:block;"></iframe></div>`;
        return`<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:${cardBg};border:1px solid ${border};font-size:11px;color:${textSub};">📄 ${att.name}</div>`;
      }
      return"";
    };

    const renderTask=(task,projectColor)=>{
      const p=prio[task.priority]||prio.low;
      const dayInfo=WEEK_DAYS.find(d=>d.key===task.day);
      const atts=(task.attachments||[]).map(renderAttachment).join("");
      return`
        <div style="padding:10px 14px;border-radius:10px;background:${task.done?taskDoneBg:cardBg};border:1px solid ${task.done?"rgba(255,255,255,0.03)":border};margin-bottom:6px;opacity:${task.done?0.55:1};">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="width:18px;height:18px;border-radius:5px;flex-shrink:0;margin-top:2px;${task.done?`background:${projectColor};`:`border:2px solid ${projectColor};background:transparent;`}display:flex;align-items:center;justify-content:center;">
              ${task.done?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`:""}
            </div>
            <div style="flex:1;min-width:0;">
              <span style="font-size:13px;color:${task.done?textMuted:textMain};text-decoration:${task.done?"line-through":"none"};font-family:'DM Sans',sans-serif;line-height:1.4;display:block;">${task.text}</span>
              ${task.description?`<span style="font-size:11px;color:${textMuted};display:block;margin-top:2px;font-family:'DM Sans',sans-serif;">${task.description}</span>`:""}
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;align-items:center;">
                ${dayInfo?`<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:${textSub};font-family:'DM Sans',sans-serif;">${dayInfo.full}</span>`:""}
                <div style="width:7px;height:7px;border-radius:50%;background:${p.color};flex-shrink:0;"></div>
                <span style="font-size:9px;color:${p.color};font-weight:600;font-family:'DM Sans',sans-serif;">${p.label}</span>
              </div>
            </div>
          </div>
          ${atts}
        </div>`;
    };

    const renderWeekByProjects=(week)=>{
      if(!week)return"";
      const title=week.title||(weeks.indexOf(week)===0?"Semana Atual":"Próxima Semana");
      const dateRange=fmtDate(week.sun,week.sat);
      const projects=week.projects||[];
      const projectsHTML=projects.filter(p=>p.tasks.length>0).map(p=>{
        const done=p.tasks.filter(t=>t.done).length;
        return`
          <div style="border-radius:14px;border:1px solid ${border};background:${cardBg};margin-bottom:14px;overflow:hidden;">
            <div style="padding:14px 16px 10px;border-bottom:1px solid ${border};background:${p.color}10;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;">${p.emoji}</span>
                <div style="flex:1;">
                  <span style="font-size:14px;font-weight:700;color:${p.color};font-family:'Inter',sans-serif;">${p.name}</span>
                  <span style="font-size:10px;color:${textMuted};font-family:'DM Sans',sans-serif;margin-left:8px;">${done}/${p.tasks.length} concluídas</span>
                </div>
              </div>
            </div>
            <div style="padding:12px 14px;">
              ${p.tasks.map(t=>renderTask(t,p.color)).join("")}
            </div>
          </div>`;
      }).join("");
      return`<div style="margin-bottom:28px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;">
          <h2 style="margin:0;font-size:18px;font-weight:800;color:${textMain};font-family:'Inter',sans-serif;">${title}</h2>
          <span style="font-size:11px;color:${textMuted};font-family:'DM Sans',sans-serif;">${dateRange}</span>
        </div>
        ${projectsHTML||`<p style="color:${textMuted};font-size:13px;font-family:'DM Sans',sans-serif;">Nenhuma tarefa.</p>`}
      </div>`;
    };

    const renderWeekByDays=(week)=>{
      if(!week)return"";
      const title=week.title||(weeks.indexOf(week)===0?"Semana Atual":"Próxima Semana");
      const dateRange=fmtDate(week.sun,week.sat);
      const allTasks=[];
      (week.projects||[]).forEach(p=>p.tasks.forEach(t=>allTasks.push({...t,_pColor:p.color,_pEmoji:p.emoji,_pName:p.name})));
      const daysHTML=WEEK_DAYS.map(d=>{
        const tasks=allTasks.filter(t=>t.day===d.key);
        if(tasks.length===0)return"";
        return`
          <div style="margin-bottom:16px;">
            <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:${textSub};font-family:'Inter',sans-serif;text-transform:uppercase;letter-spacing:0.06em;">${d.full}</h3>
            ${tasks.map(t=>{
              const pColor=t._pColor;
              const p=prio[t.priority]||prio.low;
              const atts=(t.attachments||[]).map(renderAttachment).join("");
              return`
                <div style="padding:10px 14px;border-radius:10px;background:${t.done?taskDoneBg:cardBg};border:1px solid ${t.done?"rgba(255,255,255,0.03)":border};margin-bottom:6px;opacity:${t.done?0.55:1};">
                  <div style="display:flex;align-items:flex-start;gap:10px;">
                    <div style="width:18px;height:18px;border-radius:5px;flex-shrink:0;margin-top:2px;${t.done?`background:${pColor};`:`border:2px solid ${pColor};background:transparent;`}display:flex;align-items:center;justify-content:center;">
                      ${t.done?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`:""}
                    </div>
                    <div style="flex:1;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
                        <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:${pColor}22;color:${pColor};font-family:'DM Sans',sans-serif;">${t._pEmoji} ${t._pName}</span>
                        <div style="width:6px;height:6px;border-radius:50%;background:${p.color};"></div>
                        <span style="font-size:9px;color:${p.color};font-weight:600;font-family:'DM Sans',sans-serif;">${p.label}</span>
                      </div>
                      <span style="font-size:13px;color:${t.done?textMuted:textMain};text-decoration:${t.done?"line-through":"none"};font-family:'DM Sans',sans-serif;line-height:1.4;display:block;">${t.text}</span>
                      ${t.description?`<span style="font-size:11px;color:${textMuted};display:block;margin-top:2px;font-family:'DM Sans',sans-serif;">${t.description}</span>`:""}
                    </div>
                  </div>
                  ${atts}
                </div>`;
            }).join("")}
          </div>`;
      }).join("");
      return`<div style="margin-bottom:28px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;">
          <h2 style="margin:0;font-size:18px;font-weight:800;color:${textMain};font-family:'Inter',sans-serif;">${title}</h2>
          <span style="font-size:11px;color:${textMuted};font-family:'DM Sans',sans-serif;">${dateRange}</span>
        </div>
        ${daysHTML||`<p style="color:${textMuted};font-size:13px;font-family:'DM Sans',sans-serif;">Nenhuma tarefa.</p>`}
      </div>`;
    };

    const bodyContent=weeksToRender.map(w=>viewType==="projects"?renderWeekByProjects(w):renderWeekByDays(w)).join(`<hr style="border:none;border-top:1px solid ${border};margin:0 0 28px;"/>`);

    // Contadores globais
    const allTasks=weeksToRender.flatMap(w=>(w?.projects||[]).flatMap(p=>p.tasks));
    const totalT=allTasks.length,doneT=allTasks.filter(t=>t.done).length;
    const pct=totalT?Math.round(doneT/totalT*100):0;

    return`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
<title>Relatório — Planner Semanal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:${bg};color:${textMain};font-family:'DM Sans',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @media print{
    body{background:${bg}!important;}
    .no-print{display:none!important;}
    @page{margin:12mm 14mm;size:A4;marks:none;}
  }
  /* Remove cabeçalho/rodapé do navegador na impressão */
  @page{margin:12mm 14mm;}
  @page:first{margin-top:12mm;}
</style>
</style>
</head>
<body>
<div style="max-width:720px;margin:0 auto;padding:32px 24px 48px;">

  <!-- Cabeçalho -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid ${border};">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${logoUrl}" alt="Planner Semanal" style="height:36px;" onerror="this.style.display='none'"/>
    </div>
    <div style="text-align:right;">
      <p style="font-size:12px;color:${textMuted};font-family:'DM Sans',sans-serif;">Gerado em ${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}${displayName?" · "+displayName:""}</p>
      <p style="font-size:11px;color:${textMuted};font-family:'DM Sans',sans-serif;margin-top:2px;">${viewType==="projects"?"View: Projetos":"View: Dias da Semana"}</p>
    </div>
  </div>

  <!-- Progresso global -->
  <div style="display:flex;align-items:center;gap:20px;padding:16px 20px;border-radius:14px;background:${isDark?"rgba(59,130,246,0.08)":"rgba(59,130,246,0.05)"};border:1px solid rgba(59,130,246,0.15);margin-bottom:28px;">
    <div style="position:relative;width:52px;height:52px;flex-shrink:0;">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="22" fill="none" stroke="${isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"}" stroke-width="4"/>
        <circle cx="26" cy="26" r="22" fill="none" stroke="${pct===100?"#10B981":"#3B82F6"}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${2*Math.PI*22}" stroke-dashoffset="${2*Math.PI*22*(1-pct/100)}" transform="rotate(-90 26 26)"/>
      </svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${pct===100?"#10B981":"#3B82F6"};font-family:'Inter',sans-serif;">${pct}%</span>
    </div>
    <div>
      <div style="font-size:20px;font-weight:700;color:${textMain};font-family:'Inter',sans-serif;">${doneT} de ${totalT}</div>
      <div style="font-size:12px;color:${textSub};margin-top:2px;font-family:'DM Sans',sans-serif;">tarefas concluídas</div>
    </div>
  </div>

  <!-- Conteúdo -->
  ${bodyContent}

  <!-- Rodapé -->
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${border};text-align:center;">
    <p style="font-size:10px;color:${textMuted};font-family:'DM Sans',sans-serif;">Planner Semanal · Colossenses 3:23-24</p>
  </div>

</div>
<script>
  window.onload=function(){
    document.querySelectorAll('img').forEach(function(img){
      if(!img.complete||img.naturalWidth===0){img.style.display='none';}
    });
  };
<\/script>
</body>
</html>`;
  };

  const handleGenerate=()=>{
    setGenerating(true);
    try{
      const html=buildHTML();
      const blob=new Blob([html],{type:"text/html;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const win=window.open(url,"_blank","width=900,height=700");
      if(!win){alert("Permita pop-ups para gerar o relatório.");setGenerating(false);URL.revokeObjectURL(url);return;}
      win.onload=()=>{setTimeout(()=>{win.focus();win.print();URL.revokeObjectURL(url);},400);};
    }catch(e){console.error(e);}
    setGenerating(false);
    onClose();
  };

  const Toggle=({label,value,onChange})=>(
    <button onClick={()=>onChange(!value)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:F}}>
      <div style={{width:36,height:20,borderRadius:10,background:value?"#3B82F6":tc.inputBg,border:`1px solid ${value?"#3B82F6":tc.cardBorder}`,position:"relative",transition:"all 0.2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:value?17:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
      </div>
      <span style={{fontSize:13,color:tc.textSub,fontWeight:500}}>{label}</span>
    </button>
  );

  const OptionBtn=({label,icon,active,onClick})=>(
    <button onClick={onClick} style={{flex:1,padding:"10px 8px",borderRadius:10,border:`1.5px solid ${active?"#3B82F6":tc.cardBorder}`,background:active?"rgba(59,130,246,0.12)":tc.inputBg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all 0.15s"}}>
      <span style={{fontSize:20}}>{icon}</span>
      <span style={{fontSize:11,fontWeight:600,color:active?"#3B82F6":tc.textSub,fontFamily:F}}>{label}</span>
    </button>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(5px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:16,animation:"fadeIn 0.2s ease"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:420,background:tc.modalBg,border:"1px solid rgba(59,130,246,0.2)",borderRadius:22,boxShadow:"0 8px 50px rgba(0,0,0,0.5)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"20px 22px 16px",borderBottom:`1px solid ${tc.divider}`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.15))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
          </div>
          <div style={{flex:1}}>
            <h2 style={{margin:0,fontSize:17,fontWeight:800,color:tc.text,fontFamily:FS}}>Gerar Relatório</h2>
            <p style={{margin:0,fontSize:11,color:tc.textMuted,fontFamily:F}}>Escolha as opções abaixo</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.35}} onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="0.35"}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{padding:"18px 22px 22px",display:"flex",flexDirection:"column",gap:18}}>

          {/* View */}
          <div>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Organizar por</span>
            <div style={{display:"flex",gap:8}}>
              <OptionBtn label="Projetos" icon="📂" active={viewType==="projects"} onClick={()=>setViewType("projects")}/>
              <OptionBtn label="Dias da Semana" icon="📅" active={viewType==="days"} onClick={()=>setViewType("days")}/>
            </div>
          </div>

          {/* Semana */}
          <div>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:700,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:0.6}}>Semana</span>
            <div style={{display:"flex",gap:6}}>
              {[{v:"current",l:"Semana Atual",i:"📍"},{v:"next",l:"Próxima Semana",i:"⏭️"},{v:"both",l:"Ambas",i:"📋"}].map(o=>(
                <button key={o.v} onClick={()=>setWeekSel(o.v)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1.5px solid ${weekSel===o.v?"#3B82F6":tc.cardBorder}`,background:weekSel===o.v?"rgba(59,130,246,0.12)":tc.inputBg,cursor:"pointer",fontSize:10,fontWeight:600,color:weekSel===o.v?"#3B82F6":tc.textSub,fontFamily:F,transition:"all 0.15s"}}>
                  <div style={{fontSize:16,marginBottom:3}}>{o.i}</div>{o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Anexos */}
          <div style={{padding:"12px 14px",borderRadius:11,background:tc.taskBg,border:`1px solid ${tc.cardBorder}`}}>
            <Toggle label="Incluir anexos (fotos, vídeos, documentos)" value={includeAttachments} onChange={setIncludeAttachments}/>
            {includeAttachments&&<p style={{fontSize:10,color:tc.textMuted,fontFamily:F,marginTop:6,marginLeft:44}}>Imagens, PDFs e iframes de vídeo serão embutidos no relatório.</p>}
          </div>

          {/* Botão gerar */}
          <button onClick={handleGenerate} disabled={generating} style={{width:"100%",padding:"14px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:generating?0.7:1}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
            {generating?"Gerando...":"Gerar e Imprimir / Salvar PDF"}
          </button>
          <p style={{fontSize:10,color:tc.textMuted,fontFamily:F,textAlign:"center",marginTop:-12}}>Uma nova aba será aberta com o relatório. Use Ctrl+P / ⌘+P para salvar como PDF.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function App(){
  const theme=useTheme();
  const c=theme.t;
  const [authed,setAuthed]=useState(false);
  const [userName,setUserName]=useState("");
  const [weeks,setWeeks]=useState([]);
  const [activeWeekIdx,setActiveWeekIdx]=useState(0);
  const [history,setHistory]=useState([]);
  const [expanded,setExpanded]=useState({});
  const [expandedDays,setExpandedDays]=useState(()=>{const o={};WEEK_DAYS.forEach(d=>{o[d.key]=true;});return o;});
  const [loading,setLoading]=useState(true);
  const [viewMode,setViewMode]=useState("category");
  const [reorderMode,setReorderMode]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [dragTask,setDragTask]=useState(null);
  const [editingTasks,setEditingTasks]=useState(new Set());
  const [openTaskId,setOpenTaskId]=useState(null);
  const [dragOverDay,setDragOverDay]=useState(null);

  // Bloquear drag global quando qualquer modal de tarefa estiver aberto
  useEffect(()=>{
    if(!openTaskId)return;
    const block=(e)=>{e.preventDefault();e.stopPropagation();};
    document.addEventListener("dragstart",block,true);
    return()=>document.removeEventListener("dragstart",block,true);
  },[openTaskId]);
  const [layoutMode,setLayoutMode]=useState("list");
  const [layoutUserSet,setLayoutUserSet]=useState(false);
  const [focosOpen,setFocosOpen]=useState(true);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showWhatsNew,setShowWhatsNew]=useState(false);
  const [showReport,setShowReport]=useState(false);
  const [hasUnread,setHasUnread]=useState(false);
  const [userProfile,setUserProfile]=useState({displayName:"",photoURL:""});

  // Checar se há novidades não lidas
  useEffect(()=>{
    try{
      const last=localStorage.getItem(WHATS_NEW_STORAGE_KEY);
      const latest=CHANGELOG[0]?.version||"";
      setHasUnread(last!==latest);
    }catch{setHasUnread(true);}
  },[]);
  const markWhatsNewSeen=()=>{
    try{localStorage.setItem(WHATS_NEW_STORAGE_KEY,CHANGELOG[0]?.version||"");}catch{}
    setHasUnread(false);
  };

  // Preferências por usuário — carregadas e salvas com userName na chave
  function loadUserPrefs(user){
    try{const v=localStorage.getItem(`planner-${user}-viewMode`);if(v)setViewMode(v);}catch{}
    try{const l=localStorage.getItem(`planner-${user}-layoutMode`);if(l==="columns"&&window.innerWidth>=768){setLayoutMode("columns");setLayoutUserSet(true);}else if(l==="list"){setLayoutMode("list");setLayoutUserSet(true);}}catch{}
    try{const f=localStorage.getItem(`planner-${user}-focosOpen`);if(f!==null)setFocosOpen(f==="true");}catch{}
  }
  useEffect(()=>{if(!userName)return;try{localStorage.setItem(`planner-${userName}-viewMode`,viewMode);}catch{}},[viewMode,userName]);
  useEffect(()=>{if(!userName||!layoutUserSet)return;try{localStorage.setItem(`planner-${userName}-layoutMode`,layoutMode);}catch{}},[layoutMode,layoutUserSet,userName]);
  useEffect(()=>{if(!userName)return;try{localStorage.setItem(`planner-${userName}-focosOpen`,String(focosOpen));}catch{}},[focosOpen,userName]);
  useEffect(()=>{
    const handleResize=()=>{if(window.innerWidth<768){setLayoutMode("list");}};
    window.addEventListener("resize",handleResize);
    handleResize();
    return()=>window.removeEventListener("resize",handleResize);
  },[]);
  // ─── Sessão: lida 100% do localStorage para evitar logout involuntário no mobile ───
  // O iOS/Safari pode limpar o Firestore cache mas o localStorage persiste por sessão de app.
  // Formato: { user, token, ts } salvo como JSON em SESSION_TOKEN_KEY
  useEffect(()=>{
    try{
      const raw=localStorage.getItem(SESSION_TOKEN_KEY);
      if(!raw)return; // sem sessão salva → permanece na tela de login
      const sess=JSON.parse(raw);
      if(!sess||!sess.user||!sess.token)return;
      // Sessão válida — restaurar imediatamente sem await de rede
      const uname=sess.user;
      setAuthed(true);
      setUserName(uname);
      loadUserPrefs(uname);
      // Carregar perfil (Firestore, non-blocking)
      window.storage.get(`planner-${uname}-profile`).then(pr=>{
        if(pr&&pr.value)setUserProfile(JSON.parse(pr.value));
      }).catch(()=>{});
      // Atualizar last-seen no Firestore em background
      window.storage.set(`last-seen-${uname}`,String(Date.now())).catch(()=>{});
    }catch{/* localStorage corrompido → fica no login */}
  },[]);

  const userProfileKey=(u)=>`planner-${u}-profile`;
  const handleLogin=useCallback(async(user,googlePhoto="")=>{
    // Limpar TODO o cache do localStorage antes de carregar novo usuário
    // Isso garante que dados cacheados de sessões anteriores não vazem
    try{
      const keysToRemove=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k!=='planner-theme')keysToRemove.push(k);
      }
      keysToRemove.forEach(k=>localStorage.removeItem(k));
    }catch{}
    setWeeks([]);setHistory([]);setLoading(true);
    setAuthed(true);setUserName(user);loadUserPrefs(user);
    // Persistir sessão APENAS no localStorage (robusto no mobile)
    const sessionToken=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,"0")).join("");
    const sessData=JSON.stringify({user,token:sessionToken,ts:Date.now()});
    try{localStorage.setItem(SESSION_TOKEN_KEY,sessData);}catch{}
    // Firestore: last-seen
    window.storage.set(`last-seen-${user}`,String(Date.now())).catch(()=>{});
    // Load profile from Firestore
    try{
      const r=await window.storage.get(userProfileKey(user));
      const p=r&&r.value?JSON.parse(r.value):{};
      if(googlePhoto&&!p.photoURL){p.photoURL=googlePhoto;}
      setUserProfile({displayName:p.displayName||"",photoURL:p.photoURL||""});
      if(googlePhoto&&!JSON.parse(r&&r.value||"{}").photoURL){
        window.storage.set(userProfileKey(user),JSON.stringify({...p,photoURL:googlePhoto})).catch(()=>{});
      }
    }catch{
      if(googlePhoto)setUserProfile(p=>({...p,photoURL:googlePhoto}));
    }
  },[]);
  const handleSaveProfile=useCallback(async(prof)=>{
    setUserProfile(prof);
    await window.storage.set(userProfileKey(userName),JSON.stringify(prof)).catch(()=>{});
  },[userName]);
  const handleLogout=useCallback(()=>{
    // Limpar TODO o cache do localStorage ao sair — evita vazamento de dados entre usuários
    try{
      const keysToRemove=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k!=='planner-theme')keysToRemove.push(k);
      }
      keysToRemove.forEach(k=>localStorage.removeItem(k));
    }catch{}
    setAuthed(false);setUserName("");setWeeks([]);setHistory([]);setLoading(true);
  },[]);

  useEffect(()=>{
    if(!authed||!userName)return;
    // loadToken garante que dados só sejam aplicados ao usuário que iniciou o carregamento
    // Se o userName mudar durante o await (troca de conta), o resultado é descartado
    const loadToken=userName;
    activeUserRef.current=""; // Bloquear persistência enquanto carrega
    const XANDE_DEFAULT_IDS=["dexan","ministerio","gc","teologia","extras"];
    const hasXandeDefaults=(wks)=>wks.some(w=>w.projects.some(p=>XANDE_DEFAULT_IDS.includes(p.id)));
    (async()=>{
      try{
        const r=await window.storage.get(userDataKey(loadToken));
        // Checar se o usuário ainda é o mesmo após o await — se não for, descartar
        if(loadToken!==userName)return;
        if(r&&r.value){
          const parsed=JSON.parse(r.value);
          // Se não é xande mas tem dados dos projetos padrão do xande, limpa tudo
          if(loadToken!=="xande"&&hasXandeDefaults(parsed)){
            const sun=getSunday(new Date());const sat=getSaturday(new Date());
            const clean=[{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:[]}];
            setWeeks(clean);
            window.storage.set(userDataKey(loadToken),JSON.stringify(clean)).catch(()=>{});
            window.storage.set(userHistoryKey(loadToken),JSON.stringify([])).catch(()=>{});
            setHistory([]);activeUserRef.current=loadToken;setLoading(false);return;
          }
          setWeeks(parsed);
        }else{
          const sun=getSunday(new Date());const sat=getSaturday(new Date());
          setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:getDefaultProjects(loadToken)}]);
        }
      }catch{
        if(loadToken!==userName)return;
        const sun=getSunday(new Date());const sat=getSaturday(new Date());
        setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:getDefaultProjects(loadToken)}]);
      }
      try{
        const h=await window.storage.get(userHistoryKey(loadToken));
        if(loadToken!==userName)return; // checar novamente após segundo await
        if(h&&h.value)setHistory(JSON.parse(h.value));else setHistory([]);
      }catch{setHistory([]);}
      activeUserRef.current=loadToken; // Liberar persistência só após dados corretos carregados
      setLoading(false);
    })();
  },[authed,userName]);

  const activeUserRef=useRef("");

  useEffect(()=>{if(weeks.length>0&&!loading&&userName&&userName===activeUserRef.current)window.storage.set(userDataKey(userName),JSON.stringify(weeks)).catch(()=>{});},[weeks,loading,userName]);
  useEffect(()=>{if(weeks.length>0){const p=weeks[activeWeekIdx]?.projects;if(p){const a={};p.forEach(pr=>{a[pr.id]=true;});setExpanded(a);}}},[activeWeekIdx]);

  const projects=weeks[activeWeekIdx]?.projects||[];
  const currentSun=weeks[activeWeekIdx]?new Date(weeks[activeWeekIdx].sun):getSunday(new Date());
  const currentSat=weeks[activeWeekIdx]?new Date(weeks[activeWeekIdx].sat):getSaturday(new Date());

  const updateProjects=useCallback(fn=>{setWeeks(prev=>{const arr=[...prev];if(!arr[activeWeekIdx])return prev;arr[activeWeekIdx]={...arr[activeWeekIdx],projects:fn(arr[activeWeekIdx].projects)};return arr;});},[activeWeekIdx]);
  const toggleTask=useCallback((pid,tid)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,done:!t.done}:t)}:p)),[updateProjects]);

  // updateTask suporta _newProjectId para mover tarefa entre categorias (view dias da semana)
  const updateTask=useCallback((pid,tid,u)=>{
    if(u._newProjectId&&u._newProjectId!==pid){
      updateProjects(ps=>{
        let movedTask=null;
        const ps2=ps.map(p=>{if(p.id!==pid)return p;const t=p.tasks.find(t=>t.id===tid);if(t)movedTask={...t,...Object.fromEntries(Object.entries(u).filter(([k])=>k!=='_newProjectId'))};return{...p,tasks:p.tasks.filter(t=>t.id!==tid)};});
        if(!movedTask)return ps;
        return ps2.map(p=>p.id===u._newProjectId?{...p,tasks:[...p.tasks,{...movedTask,id:`${u._newProjectId}_${Date.now()}`}]}:p);
      });
    } else {
      const {_newProjectId,...rest}=u;
      updateProjects(ps=>ps.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,...rest}:t)}:p));
    }
  },[updateProjects]);

  const addTask=useCallback((pid,text,day,priority,attachments,description)=>updateProjects(ps=>ps.map(p=>{if(p.id!==pid)return p;return{...p,tasks:[...p.tasks,{id:`${p.id}_${Date.now()}`,text,done:false,priority:priority||"medium",day:day||"seg",attachments:attachments||[],description:description||""}]};})),[updateProjects]);
  const deleteTask=useCallback((pid,tid)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,tasks:p.tasks.filter(t=>t.id!==tid)}:p)),[updateProjects]);

  // addTaskToProject: usado na view dias da semana (pid vem do seletor de categoria)
  const addTaskToProject=useCallback((text,day,priority,pid,attachments,description)=>{
    if(!pid)return;
    addTask(pid,text,day,priority,attachments,description);
  },[addTask]);

  const editProject=useCallback((pid,u)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,...u}:p)),[updateProjects]);
  const addCategory=useCallback(({name,color,emoji})=>updateProjects(ps=>[...ps,{id:`cat_${Date.now()}`,name,emoji,color,tasks:[]}]),[updateProjects]);

  // deleteProject: exclui em todas as semanas
  const deleteProject=useCallback((pid)=>{
    setWeeks(prev=>{
      const arr=JSON.parse(JSON.stringify(prev));
      for(let i=0;i<arr.length;i++){arr[i].projects=arr[i].projects.filter(p=>p.id!==pid);}
      return arr;
    });
  },[]);

  const moveProject=useCallback((index,dir)=>{
    setWeeks(prev=>{
      const arr=JSON.parse(JSON.stringify(prev));
      const ps=[...arr[activeWeekIdx].projects];
      const t=index+dir;
      if(t<0||t>=ps.length)return prev;
      [ps[index],ps[t]]=[ps[t],ps[index]];
      arr[activeWeekIdx].projects=ps;
      const orderIds=ps.map(p=>p.id);
      for(let i=0;i<arr.length;i++){
        if(i===activeWeekIdx)continue;
        const sorted=[];
        const map=new Map(arr[i].projects.map(p=>[p.id,p]));
        orderIds.forEach(id=>{if(map.has(id)){sorted.push(map.get(id));map.delete(id);}});
        map.forEach(p=>sorted.push(p));
        arr[i].projects=sorted;
      }
      return arr;
    });
  },[activeWeekIdx]);
  const toggleExpand=useCallback(id=>setExpanded(prev=>({...prev,[id]:!prev[id]})),[]);

  const moveTaskToWeek=useCallback((fromIdx,toIdx,pid,tid)=>{
    setWeeks(prev=>{const arr=JSON.parse(JSON.stringify(prev));const fromP=arr[fromIdx]?.projects;const toP=arr[toIdx]?.projects;if(!fromP||!toP)return prev;let task=null;arr[fromIdx].projects=fromP.map(p=>{if(p.id!==pid)return p;const t=p.tasks.find(t=>t.id===tid);if(t)task={...t,done:false};return{...p,tasks:p.tasks.filter(t=>t.id!==tid)};});if(!task)return prev;const has=toP.find(p=>p.id===pid);if(has){arr[toIdx].projects=toP.map(p=>p.id===pid?{...p,tasks:[...p.tasks,{...task,id:`${pid}_${Date.now()}`}]}:p);}else{const src=fromP.find(p=>p.id===pid);if(src)arr[toIdx].projects=[...toP,{...src,tasks:[{...task,id:`${pid}_${Date.now()}`}]}];}return arr;});
  },[]);

  const updateWeekTitle=useCallback((idx,title)=>{setWeeks(prev=>{const arr=[...prev];if(!arr[idx])return prev;arr[idx]={...arr[idx],title};return arr;});},[]);

  // Clona todas as tarefas de um projeto da semana atual para a próxima (reseta done=false)
  const repeatProjectToNextWeek=useCallback((pid)=>{
    setWeeks(prev=>{
      if(prev.length<2)return prev;
      const arr=JSON.parse(JSON.stringify(prev));
      const srcProject=arr[0].projects.find(p=>p.id===pid);
      if(!srcProject||srcProject.tasks.length===0)return prev;
      const cloned=srcProject.tasks.map(t=>({...t,id:`${pid}_rep_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,done:false}));
      const destIdx=arr[1].projects.findIndex(p=>p.id===pid);
      if(destIdx>=0){arr[1].projects[destIdx]={...arr[1].projects[destIdx],tasks:[...arr[1].projects[destIdx].tasks,...cloned]};}
      else{arr[1].projects=[...arr[1].projects,{...srcProject,tasks:cloned}];}
      return arr;
    });
  },[]);

  const addNextWeek=useCallback(()=>{const last=weeks[weeks.length-1];const lastSun=last?new Date(last.sun):getSunday(new Date());const nextSun=addWeeks(lastSun,1);const nextSat=getSaturday(nextSun);const empty=projects.map(p=>({...p,tasks:[]}));setWeeks(prev=>[...prev,{id:weekId(nextSun),sun:nextSun.toISOString(),sat:nextSat.toISOString(),projects:empty}]);},[weeks,projects]);

  const canComplete=projects.some(p=>p.tasks.some(t=>t.done));

  // Puxa todas as tarefas da próxima semana para a atual (mescla, sem duplicar)
  const pullNextWeek=useCallback(()=>{
    if(weeks.length<2)return;
    setWeeks(prev=>{
      const arr=[...prev];
      const cur=arr[0];
      const nxt=arr[1];
      // Para cada projeto, mescla tarefas da próxima semana nas da atual
      const mergedProjects=cur.projects.map(p=>{
        const nxtProj=nxt.projects.find(np=>np.id===p.id);
        if(!nxtProj||nxtProj.tasks.length===0)return p;
        const newTasks=nxtProj.tasks.map(t=>({...t,id:t.id||Date.now()+Math.random(),done:false}));
        return{...p,tasks:[...p.tasks,...newTasks]};
      });
      // Limpa tarefas da próxima semana (mantém estrutura de projetos)
      const clearedNext={...nxt,projects:nxt.projects.map(p=>({...p,tasks:[]})),title:""};
      arr[0]={...cur,projects:mergedProjects};
      arr[1]=clearedNext;
      return arr;
    });
  },[weeks]);

  const confirmComplete=useCallback(()=>{
    if(!userName)return;
    const curTitle=weeks[activeWeekIdx]?.title||(activeWeekIdx===0?"Semana Atual":"Próxima Semana");
    const rec={week:curTitle,date:new Date().toISOString(),projects:projects.map(p=>{const d=p.tasks.filter(t=>t.done);return d.length>0?{name:p.name,emoji:p.emoji,color:p.color,tasks:d.map(t=>({text:t.text,day:t.day,priority:t.priority}))}:null;}).filter(Boolean)};
    rec.total=rec.projects.reduce((s,p)=>s+p.tasks.length,0);
    const newH=[rec,...history].slice(0,52);
    setHistory(newH);
    window.storage.set(userHistoryKey(userName),JSON.stringify(newH)).catch(()=>{});
    setWeeks(prev=>{
      const arr=[...prev];
      // Remove tarefas concluídas da semana atual
      arr[activeWeekIdx]={...arr[activeWeekIdx],projects:arr[activeWeekIdx].projects.map(p=>({...p,tasks:p.tasks.filter(t=>!t.done)}))};
      // Se existe próxima semana, mescla tarefas dela na atual e limpa
      if(activeWeekIdx===0&&arr[1]){
        const cur=arr[0];
        const nxt=arr[1];
        const mergedProjects=cur.projects.map(p=>{
          const nxtProj=nxt.projects.find(np=>np.id===p.id);
          if(!nxtProj||nxtProj.tasks.length===0)return p;
          const newTasks=nxtProj.tasks.map(t=>({...t,id:t.id||Date.now()+Math.random(),done:false}));
          return{...p,tasks:[...p.tasks,...newTasks]};
        });
        arr[0]={...cur,projects:mergedProjects};
        arr[1]={...nxt,projects:nxt.projects.map(p=>({...p,tasks:[]})),title:""};
      }
      return arr;
    });
    setShowConfirm(false);
  },[projects,userName,history,currentSun,currentSat,activeWeekIdx,weeks]);
  const deleteHistoryEntry=useCallback(i=>{const n=history.filter((_,j)=>j!==i);setHistory(n);window.storage.set(userHistoryKey(userName),JSON.stringify(n)).catch(()=>{});},[history,userName]);

  // Detecta ?reset=TOKEN na URL para tela de redefinição de senha
  const resetToken = (() => { try { return new URLSearchParams(window.location.search).get("reset"); } catch { return null; } })();
  if (resetToken) return <ResetPasswordScreen token={resetToken} onSuccess={() => { window.location.replace(window.location.pathname); }} theme={theme} />;

  // Detecta ?invite=EMAIL — tem prioridade sobre sessão logada (outro usuário pode abrir o link)
  const inviteParam = (() => { try { const p = new URLSearchParams(window.location.search); const inv = p.get("invite"); return inv ? decodeURIComponent(inv) : null; } catch { return null; } })();
  if (inviteParam) return <InviteGate invitedEmail={inviteParam} onSuccess={(username, photo="") => { try { window.history.replaceState({},"",(window.location.pathname)); } catch {} handleLogin(username, photo); }} onBack={() => { try { window.history.replaceState({},"",(window.location.pathname)); } catch {} window.location.replace(window.location.pathname); }} theme={theme} />;

  if(!authed) return <LoginScreen onLogin={handleLogin} theme={theme}/>;
  if(loading||weeks.length===0) return(<div style={{minHeight:"100vh",background:c.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:c.textMuted,fontSize:16,fontFamily:F}}>Carregando...</div></div>);

  const totalTasks=projects.reduce((s,p)=>s+p.tasks.length,0);
  const doneTasks=projects.reduce((s,p)=>s+p.tasks.filter(t=>t.done).length,0);
  const globalPercent=totalTasks>0?Math.round((doneTasks/totalTasks)*100):0;
  const isCurrentWeek=activeWeekIdx===0;
  const weekData=WEEK_DAYS.map(day=>{const tasks=[];projects.forEach(p=>{p.tasks.forEach(t=>{if(t.day===day.key)tasks.push({...t,_projectId:p.id});});});return{day,tasks};});

  const taskMoveWeekFn=(pid,tid)=>{
    if(isCurrentWeek&&weeks.length>1) return(<button onClick={()=>moveTaskToWeek(0,1,pid,tid)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.1)",color:"#D97706",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F,width:"100%",justifyContent:"center"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>Adiar para próxima semana</button>);
    if(!isCurrentWeek) return(<button onClick={()=>moveTaskToWeek(activeWeekIdx,0,pid,tid)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(16,185,129,0.3)",background:"rgba(16,185,129,0.1)",color:"#059669",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F,width:"100%",justifyContent:"center"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 5 5 12 12 19"/></svg>Adiantar para semana atual</button>);
    return null;
  };

  const doneProjects=projects.map(p=>{const d=p.tasks.filter(t=>t.done);return d.length>0?{...p,doneTasks:d}:null;}).filter(Boolean);
  const pendingProjects=projects.map(p=>{const pn=p.tasks.filter(t=>!t.done);return pn.length>0?{...p,pendingTasks:pn}:null;}).filter(Boolean);
  const totalDone=doneProjects.reduce((s,p)=>s+p.doneTasks.length,0);
  const totalPending=pendingProjects.reduce((s,p)=>s+p.pendingTasks.length,0);

  return(
    <div style={{minHeight:"100vh",background:c.bg,fontFamily:F,transition:"background 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@600;700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.2)}}.task-card{transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}.task-card:hover{transform:translateY(-1px);box-shadow:0 4px 20px ${c.hoverShadow};border-color:${c.hoverBorder}!important}.project-card{transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}.project-card:hover{box-shadow:0 6px 28px ${c.hoverShadow};border-color:${c.hoverBorder}!important}.logout-btn{transition:all 0.25s ease}.logout-btn:hover{background:rgba(239,68,68,0.08)!important;border-color:rgba(239,68,68,0.35)!important;box-shadow:0 0 16px rgba(239,68,68,0.12)}.theme-btn{transition:all 0.25s ease}.theme-btn:hover{background:rgba(59,130,246,0.08)!important;border-color:rgba(59,130,246,0.35)!important;box-shadow:0 0 16px rgba(59,130,246,0.15)}.theme-btn:hover svg{stroke:#3B82F6}.header-actions{display:flex;flex-direction:row;gap:6px;align-items:center}.header-btn{flex-shrink:0}@media(max-width:767px){.layout-toggle{display:none!important}.header-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:5px;width:auto}.header-actions .header-btn:last-child:nth-child(odd){grid-column:2/3;justify-self:end}}`}</style>

      <div style={{maxWidth:layoutMode==="columns"?1200:520,margin:"0 auto",padding:"24px 16px 40px",transition:"max-width 0.3s ease"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <Logo theme={theme.mode} />
            <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
              {userName&&(
                <div onClick={()=>setShowSettings(true)} style={{flexShrink:0,cursor:"pointer"}} title="Configurações do perfil">
                  {userProfile.photoURL?(
                    <img src={userProfile.photoURL} alt="avatar" style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:`2.5px solid ${c.cardBorder}`,transition:"border-color 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#3B82F6"} onMouseLeave={e=>e.currentTarget.style.borderColor=c.cardBorder}/>
                  ):(
                    <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",border:`2.5px solid ${c.cardBorder}`,transition:"border-color 0.2s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.borderColor="#3B82F6"} onMouseLeave={e=>e.currentTarget.style.borderColor=c.cardBorder}>
                      <span style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:FS}}>{(userProfile.displayName||userName).charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
              )}
              <div>
                {userName&&<p style={{fontSize:13,color:c.textSub,margin:"0 0 2px",fontWeight:500}}>Olá, <span style={{color:"#3B82F6",fontWeight:700}}>{userProfile.displayName||userName}</span></p>}
                <p style={{fontSize:11,color:c.textMuted,margin:0}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>
              </div>
            </div>
          </div>
          <div className="header-actions" style={{display:"flex",gap:6,flexShrink:0}}>
            {userName===ADMIN_USER&&(<button onClick={()=>setShowAdmin(true)} title="Painel de Admin" className="header-btn admin-btn" style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.35)",borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(139,92,246,0.7)";e.currentTarget.style.background="rgba(139,92,246,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(139,92,246,0.35)";e.currentTarget.style.background="rgba(139,92,246,0.1)";}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/><path d="M12 14c-7 0-9 3-9 4v1h18v-1c0-1-2-4-9-4z"/><path d="M19 8l2 2-6 6"/></svg>
            </button>)}
            {/* Novidades */}
            <button onClick={()=>setShowWhatsNew(true)} title="Novidades" className="header-btn" style={{position:"relative",background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.5)";e.currentTarget.style.background="rgba(59,130,246,0.08)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.btnBorder;e.currentTarget.style.background=c.btnBg;}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={hasUnread?"#60A5FA":c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {hasUnread&&<span style={{position:"absolute",top:5,right:5,width:8,height:8,borderRadius:"50%",background:"#EF4444",border:`2px solid ${c.bg}`,animation:"pulse 2s infinite"}}/>}
            </button>
            {/* Relatório */}
            <button onClick={()=>setShowReport(true)} title="Gerar Relatório" className="header-btn" style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(16,185,129,0.5)";e.currentTarget.style.background="rgba(16,185,129,0.08)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.btnBorder;e.currentTarget.style.background=c.btnBg;}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
            </button>
            {/* Settings */}
            {userName&&(<button onClick={()=>setShowSettings(true)} title="Configurações do perfil" className="header-btn" style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.5)";e.currentTarget.style.background="rgba(59,130,246,0.08)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.btnBorder;e.currentTarget.style.background=c.btnBg;}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>)}
            <button className="theme-btn header-btn" onClick={theme.toggle} style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}} title={theme.mode==="dark"?"Modo claro":"Modo escuro"}>{theme.mode==="dark"?(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>):(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>)}</button>
            <button className="logout-btn header-btn" onClick={handleLogout} title="Sair" style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
          </div>
        </div>

        {/* Week Selector */}
        <div style={{background:isCurrentWeek?c.weekBg:c.weekNextBg,border:`1px solid ${c.cardBorder}`,borderRadius:16,padding:"16px 20px",marginBottom:16,transition:"all 0.3s ease"}}>
          <div style={{marginBottom:10,textAlign:"center"}}>
            <WeekTitleEditor
              title={weeks[activeWeekIdx]?.title||""}
              defaultTitle={activeWeekIdx===0?"Semana Atual":"Próxima Semana"}
              color={isCurrentWeek?c.weekTabColor0:c.weekTabColor1}
              c={c}
              onSave={t=>updateWeekTitle(activeWeekIdx,t)}
            />
          </div>
          <div style={{display:"flex",gap:6,marginBottom:4}}>
            {weeks.map((w,i)=>(<button key={w.id} onClick={()=>setActiveWeekIdx(i)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:600,background:activeWeekIdx===i?(i===0?c.weekTabActive0:c.weekTabActive1):c.weekTabInactive,color:activeWeekIdx===i?(i===0?c.weekTabColor0:c.weekTabColor1):c.weekTabColorInactive,transition:"all 0.2s"}}>{i===0?"Atual":"Próxima"}</button>))}
          </div>
          {(()=>{const highTasks=projects.flatMap(p=>p.tasks.filter(t=>t.priority==="high").map(t=>({...t,_projectEmoji:p.emoji,_projectColor:p.color})));if(highTasks.length===0)return null;const focosColor=isCurrentWeek?c.weekTabColor0:c.weekTabColor1;const focosBg=isCurrentWeek?"rgba(59,130,246,0.12)":"rgba(139,92,246,0.12)";return(<div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${c.divider}`}}><div onClick={()=>setFocosOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:focosOpen?8:0,cursor:"pointer",userSelect:"none"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={focosColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><div style={{display:"flex",flexDirection:"column",gap:1}}><span style={{fontSize:11,fontWeight:700,color:focosColor,fontFamily:F,textTransform:"uppercase",letterSpacing:"0.06em"}}>Focos da semana</span><span style={{fontSize:9,fontWeight:500,color:focosColor,fontFamily:F,opacity:0.6,letterSpacing:"0.02em"}}>Tarefas com alta prioridade</span></div><span style={{fontSize:10,fontWeight:600,color:focosColor,background:focosBg,borderRadius:5,padding:"1px 6px",fontFamily:F}}>{highTasks.filter(t=>t.done).length}/{highTasks.length}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={focosColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:"auto",transition:"transform 0.2s ease",transform:focosOpen?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg></div>{focosOpen&&<div style={{display:"flex",flexDirection:"column",gap:5,animation:"fadeIn 0.2s ease"}}>{highTasks.map((t,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,opacity:t.done?0.35:1,transition:"opacity 0.3s ease"}}><div style={{width:6,height:6,borderRadius:"50%",background:t.done?"transparent":t._projectColor,border:t.done?`1.5px solid ${t._projectColor}40`:"none",flexShrink:0}}/><span style={{fontSize:12,color:t.done?c.textMuted:c.textSub,fontFamily:F,lineHeight:1.4,flex:1,textDecoration:t.done?"line-through":"none"}}>{t.text}</span><span style={{fontSize:10,fontFamily:F,color:t.done?c.textMuted:t._projectColor,background:t.done?c.tagBg:`${t._projectColor}18`,padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{t._projectEmoji}</span></div>))}</div>}</div>);})()}
        </div>

        {/* Global Progress */}
        <div style={{background:isCurrentWeek?c.progressBg:c.progressNextBg,border:`1px solid ${c.cardBorder}`,borderRadius:16,padding:"20px 24px",display:"flex",alignItems:"center",gap:20,marginBottom:16,transition:"all 0.3s ease"}}>
          <ProgressRing percent={globalPercent} color={globalPercent===100?"#10B981":(isCurrentWeek?"#3B82F6":"#7C3AED")} size={64} c={c}/>
          <div><div style={{fontSize:22,fontWeight:700,color:c.text}}>{doneTasks} de {totalTasks}</div><div style={{fontSize:13,color:c.textSub,marginTop:2}}>tarefas concluídas</div></div>
        </div>

        {/* View Toggle */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{display:"flex",background:c.viewToggleBg,borderRadius:10,border:`1px solid ${c.viewToggleBorder}`,overflow:"hidden",flex:1}}>
            <button onClick={()=>{setViewMode("category");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="category"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="category"?"#3B82F6":c.textMuted}}>Projetos</button>
            <button onClick={()=>{setViewMode("weekday");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="weekday"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="weekday"?"#3B82F6":c.textMuted}}>Dias da Semana</button>
          </div>
          {viewMode==="category"&&(<button onClick={()=>setReorderMode(!reorderMode)} style={{background:reorderMode?"rgba(59,130,246,0.15)":c.btnBg,border:`1px solid ${reorderMode?"rgba(59,130,246,0.3)":c.btnBorder}`,borderRadius:10,padding:"9px 10px",cursor:"pointer"}}>{layoutMode==="columns"?(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reorderMode?"#3B82F6":c.textMuted} strokeWidth="2" strokeLinecap="round"><polyline points="3 12 21 12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>):(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reorderMode?"#3B82F6":c.textMuted} strokeWidth="2" strokeLinecap="round"><polyline points="12 3 12 21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg>)}</button>)}
          <button onClick={()=>{const next=layoutMode==="list"?"columns":"list";setLayoutMode(next);setLayoutUserSet(true);}} title={layoutMode==="list"?"Visualização em colunas":"Visualização em lista"} className="layout-toggle" style={{background:layoutMode==="columns"?"rgba(59,130,246,0.15)":c.btnBg,border:`1px solid ${layoutMode==="columns"?"rgba(59,130,246,0.3)":c.btnBorder}`,borderRadius:10,padding:"9px 10px",cursor:"pointer"}}>
            {layoutMode==="list"?(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>):(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>)}
          </button>
        </div>

        {/* Priority Legend */}
        <div style={{display:"flex",gap:16,marginBottom:14,paddingLeft:4}}>{Object.entries(priorityConfig).map(([k,v])=>(<div key={k} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:v.dot}}/><span style={{fontSize:11,color:c.legendColor,fontWeight:500}}>{v.label}</span></div>))}</div>

        {/* Content */}
        {layoutMode==="list"?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {viewMode==="category"?(<>
            {projects.map((p,idx)=>(<ProjectCard key={p.id} project={p} onToggleTask={toggleTask} onUpdateTask={updateTask} onAddTask={addTask} onDeleteTask={deleteTask} onEditProject={u=>editProject(p.id,u)} onDeleteProject={()=>deleteProject(p.id)} onRepeatToNextWeek={()=>repeatProjectToNextWeek(p.id)} hasNextWeek={weeks.length>1} isExpanded={expanded[p.id]??true} onToggleExpand={()=>toggleExpand(p.id)} reorderMode={reorderMode} onMoveUp={()=>moveProject(idx,-1)} onMoveDown={()=>moveProject(idx,1)} isFirst={idx===0} isLast={idx===projects.length-1} taskMoveWeek={taskMoveWeekFn} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c}/>))}
            <AddCategoryCard onAdd={addCategory} c={c}/>
          </>):(
            <>
            {weekData.map(({day,tasks})=>{const isDayExpanded=expandedDays[day.key]!==false;return(<div key={day.key} className="project-card"
              onDragOver={e=>{e.preventDefault();setDragOverDay(day.key);}}
              onDragLeave={()=>setDragOverDay(null)}
              onDrop={e=>{e.preventDefault();setDragOverDay(null);if(dragTask){updateTask(dragTask.projectId,dragTask.taskId,{day:day.key});setDragTask(null);}}}
              style={{background:dragOverDay===day.key?c.dragOverBg:c.cardBg,borderRadius:16,border:`1px solid ${dragOverDay===day.key?c.dragOverBorder:c.cardBorder}`,overflow:"hidden",transition:"all 0.2s ease"}}>
              <div onClick={()=>setExpandedDays(prev=>({...prev,[day.key]:!isDayExpanded}))} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px",cursor:"pointer",userSelect:"none"}}>
                <div style={{width:42,height:42,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:tasks.length>0?"rgba(59,130,246,0.12)":c.viewToggleBg,fontSize:13,fontWeight:700,color:tasks.length>0?"#3B82F6":c.textMuted,fontFamily:F}}>{day.label}</div>
                <div style={{flex:1}}><span style={{fontSize:16,fontWeight:700,color:c.text,fontFamily:F}}>{day.full}</span><span style={{fontSize:12,color:c.textMuted,display:"block",fontFamily:F}}>{tasks.filter(t=>t.done).length}/{tasks.length} concluídas</span></div>
                {tasks.length>0&&<ProgressRing percent={Math.round((tasks.filter(t=>t.done).length/tasks.length)*100)} color="#3B82F6" size={42} c={c}/>}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform 0.2s ease",transform:isDayExpanded?"rotate(180deg)":"rotate(0deg)",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isDayExpanded&&(<>
                {tasks.length>0&&(<div style={{padding:"0 14px 6px",display:"flex",flexDirection:"column",gap:6}}>
                  {[...tasks].sort((a,b)=>{const done=(a.done?1:0)-(b.done?1:0);if(done!==0)return done;const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;const pa=projects.find(x=>x.id===a._projectId);const pb=projects.find(x=>x.id===b._projectId);const pn=(pa?.name||"").localeCompare(pb?.name||"","pt-BR");if(pn!==0)return pn;return a.text.localeCompare(b.text,"pt-BR");}).map(t=>{const proj=projects.find(p=>p.id===t._projectId);return(<div key={t.id} draggable={!editingTasks.has(t.id)&&!openTaskId} onDragStart={()=>{if(!editingTasks.has(t.id)&&!openTaskId)setDragTask({projectId:t._projectId,taskId:t.id});}} onDragEnd={()=>{setDragTask(null);setDragOverDay(null);}} style={{cursor:editingTasks.has(t.id)?"default":"grab",opacity:dragTask?.taskId===t.id?0.4:1,transition:"opacity 0.2s"}}><TaskItem task={t} color={proj?.color||"#64748B"} projectName={proj?.name} onToggle={()=>toggleTask(t._projectId,t.id)} onUpdate={u=>updateTask(t._projectId,t.id,u)} onDelete={()=>deleteTask(t._projectId,t.id)} onMoveWeek={taskMoveWeekFn(t._projectId,t.id)} onEditingChange={v=>{setEditingTasks(prev=>{const n=new Set(prev);if(v)n.add(t.id);else n.delete(t.id);return n;})}} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c} projects={projects} showCategoryPicker={true}/></div>);})}
                </div>)}
                <div style={{padding:"6px 14px 14px"}}>
                  <AddTaskInput color="#3B82F6" onAdd={addTaskToProject} c={c} projects={projects} requireCategory={true} defaultDay={day.key}/>
                </div>
              </>)}
            </div>);})}
            </>
          )}
        </div>
        ):(
        /* COLUMNS LAYOUT */
        <div style={{display:"grid",gridTemplateColumns:viewMode==="category"?`repeat(${Math.min(projects.length+1,5)}, 1fr)`:`repeat(${WEEK_DAYS.length}, 1fr)`,gap:10,overflowX:"auto"}}>
          {viewMode==="category"?(<>
            {projects.map((p,idx)=>{const done=p.tasks.filter(t=>t.done).length;const total=p.tasks.length;const pct=total>0?Math.round((done/total)*100):0;return(
              <ColumnProjectCard key={p.id} project={p} done={done} total={total} pct={pct} idx={idx} projectsLen={projects.length} reorderMode={reorderMode} onMoveProject={moveProject} onEditProject={u=>editProject(p.id,u)} onDeleteProject={()=>deleteProject(p.id)} onToggleTask={toggleTask} onUpdateTask={updateTask} onDeleteTask={deleteTask} onAddTask={addTask} taskMoveWeekFn={taskMoveWeekFn} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c}/>
            );})}
            <AddCategoryCard onAdd={addCategory} c={c}/>
          </>):(
            weekData.map(({day,tasks})=>(
              <div key={day.key}
                onDragOver={e=>{e.preventDefault();setDragOverDay(day.key);}}
                onDragLeave={()=>setDragOverDay(null)}
                onDrop={e=>{e.preventDefault();setDragOverDay(null);if(dragTask){updateTask(dragTask.projectId,dragTask.taskId,{day:day.key});setDragTask(null);}}}
                style={{background:dragOverDay===day.key?c.dragOverBg:c.colDayBg,borderRadius:14,border:`1px solid ${dragOverDay===day.key?c.dragOverBorder:c.colDayBorder}`,overflow:"hidden",minWidth:150,transition:"all 0.2s ease"}}>
                <div style={{padding:"12px 10px",borderBottom:`1px solid ${c.colDayDivider}`,textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:700,color:tasks.length>0?"#3B82F6":c.textMuted,fontFamily:F}}>{day.label}</div>
                  <div style={{fontSize:10,color:c.textMuted,fontFamily:F}}>{day.full}</div>
                  {tasks.length>0&&<div style={{marginTop:6}}><ProgressRing percent={Math.round((tasks.filter(t=>t.done).length/tasks.length)*100)} color="#3B82F6" size={32} c={c}/></div>}
                </div>
                <div style={{padding:"8px 6px 6px",display:"flex",flexDirection:"column",gap:5,minHeight:60}}>
                  {[...tasks].sort((a,b)=>{const done=(a.done?1:0)-(b.done?1:0);if(done!==0)return done;const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;const pa=projects.find(x=>x.id===a._projectId);const pb=projects.find(x=>x.id===b._projectId);const pn=(pa?.name||"").localeCompare(pb?.name||"","pt-BR");if(pn!==0)return pn;return a.text.localeCompare(b.text,"pt-BR");}).map(t=>{const proj=projects.find(pp=>pp.id===t._projectId);return(<div key={t.id} draggable={!editingTasks.has(t.id)&&!openTaskId} onDragStart={()=>{if(!editingTasks.has(t.id)&&!openTaskId)setDragTask({projectId:t._projectId,taskId:t.id});}} onDragEnd={()=>{setDragTask(null);setDragOverDay(null);}} style={{cursor:editingTasks.has(t.id)?"default":"grab",opacity:dragTask?.taskId===t.id?0.4:1,transition:"opacity 0.2s"}}><TaskItem task={t} color={proj?.color||"#64748B"} projectName={proj?.name} onToggle={()=>toggleTask(t._projectId,t.id)} onUpdate={u=>updateTask(t._projectId,t.id,u)} onDelete={()=>deleteTask(t._projectId,t.id)} onMoveWeek={taskMoveWeekFn(t._projectId,t.id)} onEditingChange={v=>{setEditingTasks(prev=>{const n=new Set(prev);if(v)n.add(t.id);else n.delete(t.id);return n;})}} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c} projects={projects} showCategoryPicker={true}/></div>);})}
                  {tasks.length===0&&<div style={{fontSize:11,color:dragOverDay===day.key?"#3B82F6":c.textMuted,fontFamily:F,textAlign:"center",padding:"8px 0"}}>{dragOverDay===day.key?"Soltar aqui":"—"}</div>}
                </div>
                <div style={{padding:"0 6px 8px"}}>
                  <AddTaskInput color="#3B82F6" onAdd={addTaskToProject} c={c} projects={projects} requireCategory={true} defaultDay={day.key}/>
                </div>
              </div>
            ))
          )}
        </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:28,flexWrap:"wrap"}}>
          {isCurrentWeek&&<button onClick={()=>canComplete&&setShowConfirm(true)} style={{background:canComplete?"linear-gradient(135deg,rgba(59,130,246,0.15),rgba(139,92,246,0.15))":c.btnBg,border:`1px solid ${canComplete?"rgba(99,102,241,0.3)":c.btnBorder}`,color:canComplete?"#6366F1":c.textMuted,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:canComplete?"pointer":"default",fontFamily:F,fontWeight:600,opacity:canComplete?1:0.5}}>✓ Completar semana</button>}
          {!isCurrentWeek&&weeks[1]&&weeks[1].projects.some(p=>p.tasks.length>0)&&<button onClick={()=>{if(window.confirm("Puxar todas as tarefas da Próxima Semana para a Semana Atual? As tarefas serão adicionadas às que já existem na semana atual."))pullNextWeek();}} style={{background:"linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1))",border:"1px solid rgba(16,185,129,0.3)",color:"#10B981",fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:600}}>⬆ Puxar para semana atual</button>}
          {weeks.length<2&&<button onClick={addNextWeek} style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,color:c.textSub,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>+ Nova semana</button>}
          <button onClick={()=>setShowHistory(!showHistory)} style={{background:showHistory?"rgba(59,130,246,0.12)":c.btnBg,border:`1px solid ${showHistory?"rgba(59,130,246,0.3)":c.btnBorder}`,color:showHistory?"#3B82F6":c.textSub,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>📋 Histórico</button>
        </div>

        {/* Confirm Modal */}
        {showConfirm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,animation:"fadeIn 0.2s ease",padding:16}} onClick={()=>setShowConfirm(false)}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto",background:c.modalBg,border:`1px solid ${c.cardBorder}`,borderRadius:20,padding:24,boxShadow:theme.mode==="light"?"0 8px 40px rgba(0,0,0,0.15)":"0 8px 40px rgba(0,0,0,0.5)"}}>
          <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:"0 0 4px",fontFamily:FS}}>Completar semana</h2>
          <p style={{fontSize:12,color:c.textMuted,margin:"0 0 10px",fontFamily:F}}>{weeks[activeWeekIdx]?.title||(activeWeekIdx===0?"Semana Atual":"Próxima Semana")}</p>
          {weeks[1]&&weeks[1].projects.some(p=>p.tasks.length>0)&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:8,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",marginBottom:14}}><span style={{fontSize:12}}>⬆</span><span style={{fontSize:11,color:"#10B981",fontFamily:F,fontWeight:500}}>As tarefas da Próxima Semana serão puxadas para a Semana Atual</span></div>}
          <div style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#10B981"}}/><span style={{fontSize:12,fontWeight:700,color:"#10B981",fontFamily:F}}>Concluídas ({totalDone})</span></div>{doneProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.doneTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{fontSize:11,color:c.textSub,fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>
          {totalPending>0&&<div style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#F59E0B"}}/><span style={{fontSize:12,fontWeight:700,color:"#D97706",fontFamily:F}}>Pendentes — permanecem ({totalPending})</span></div>{pendingProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.pendingTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><div style={{width:8,height:8,borderRadius:4,border:`1.5px solid ${c.textMuted}`,flexShrink:0}}/><span style={{fontSize:11,color:c.textSub,fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>}
          <div style={{display:"flex",gap:10}}><button onClick={confirmComplete} style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:F}}>Confirmar</button><button onClick={()=>setShowConfirm(false)} style={{padding:"12px 20px",borderRadius:12,border:`1px solid ${c.cardBorder}`,background:c.cancelBg,color:c.textSub,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button></div>
        </div></div>)}

        {/* History */}
        {showHistory&&(<div style={{marginTop:20,display:"flex",flexDirection:"column",gap:10,animation:"fadeIn 0.3s ease"}}><h3 style={{fontSize:14,fontWeight:700,color:c.textSub,margin:0,fontFamily:F}}>Semanas concluídas</h3>{history.length===0&&<p style={{fontSize:13,color:c.textMuted,fontFamily:F}}>Nenhum registro ainda.</p>}{history.map((rec,i)=>(<HistoryCard key={i} record={rec} onDelete={()=>deleteHistoryEntry(i)} c={c} themeMode={theme.mode} viewMode={viewMode}/>))}</div>)}

        {/* Admin Panel */}
        {showAdmin&&<AdminPanel onClose={()=>setShowAdmin(false)} theme={theme}/>}
        {showSettings&&<UserSettingsModal userName={userName} profile={userProfile} onSave={handleSaveProfile} onClose={()=>setShowSettings(false)} c={c}/>}
        {showWhatsNew&&<WhatsNewModal onClose={()=>setShowWhatsNew(false)} c={c} onMarkSeen={markWhatsNewSeen} isAdmin={userName===ADMIN_USER}/>}
        {showReport&&<ReportModal weeks={weeks} onClose={()=>setShowReport(false)} c={c} theme={theme} userProfile={userProfile} userName={userName} initialViewType={viewMode==="weekday"?"days":"projects"}/>}

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:32,opacity:0.35}}>
          <p style={{fontSize:11,color:c.textSub,margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
          <p style={{fontSize:10,color:c.textMuted,margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
        </div>
      </div>
    </div>
  );
}
