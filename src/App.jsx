import React, { useState, useEffect, useCallback } from "react";

const LOGO_DARK = `${import.meta.env.BASE_URL}logo.svg`;
const LOGO_LIGHT = `${import.meta.env.BASE_URL}logo-light.svg`;

const AUTH_KEY = "gestor-auth";
const USER_KEY = "gestor-user";

const CREDENTIALS = {
  "xande": "df0a720d14ebe80f38b75efe20f84c740e176e3eca65183ddaf75999510c08e3",
  "dea": "054676b7727c43a1b5bf80588455e074b7cb8343a3b4c26c5389c668fb6a79b6",
};

async function hashStr(input) {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function verifyCredentials(user, pin) {
  const u = user.toLowerCase().trim();
  if (!CREDENTIALS[u]) return false;
  return (await hashStr(`${u}:${pin}`)) === CREDENTIALS[u];
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
const FS = "'Syne', sans-serif";

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

function Logo({ size = "normal", theme = "dark" }) {
  const src = theme === "light" ? LOGO_LIGHT : LOGO_DARK;
  return <img src={src} alt="Planner Semanal" style={{ width: size === "normal" ? 180 : 200, display: "block", marginLeft: size === "large" ? "auto" : undefined, marginRight: size === "large" ? "auto" : undefined }} />;
}

/* ─── Login ─── */
function LoginScreen({ onLogin, theme }) {
  const [user,setUser]=useState(""); const [pin,setPin]=useState("");
  const [error,setError]=useState(false); const [shake,setShake]=useState(false);
  const handleSubmit = async () => {
    if(!user.trim()||!pin){setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);return;}
    if(await verifyCredentials(user,pin)){onLogin(user.trim().toLowerCase());}
    else{setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);}
  };
  const c=theme.t;
  return (
    <div style={{minHeight:"100vh",background:c.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px",transition:"background 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <button className="theme-btn" onClick={theme.toggle} style={{position:"fixed",top:16,right:16,background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}} title={theme.mode==="dark"?"Modo claro":"Modo escuro"}>{theme.mode==="dark"?(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>):(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>)}</button>
      <div style={{width:340,padding:40,textAlign:"center",background:c.loginCardBg,border:`1px solid ${c.loginCardBorder}`,borderRadius:24,animation:shake?"shake 0.5s ease":"fadeIn 0.6s ease",boxShadow:theme.mode==="light"?"0 4px 24px rgba(0,0,0,0.08)":"none"}}>
        <div style={{ marginBottom: 16 }}><Logo size="large" theme={theme.mode} /></div>
        <p style={{fontSize:13,color:c.textSub,margin:"0 0 24px",lineHeight:1.5}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>
        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Usuário</span>
          <input type="text" value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("pin-input")?.focus()} placeholder="seu usuário" autoFocus
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:c.inputBg,border:`2px solid ${error?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F,transition:"border-color 0.2s ease"}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <span style={{fontSize:11,color:c.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>PIN</span>
          <input id="pin-input" type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="• • • •"
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:20,textAlign:"center",background:c.inputBg,border:`2px solid ${error?"#EF4444":c.inputBorder}`,borderRadius:12,color:c.inputText,outline:"none",fontFamily:F,letterSpacing:8,transition:"border-color 0.2s ease"}}/>
        </div>
        {error&&<p style={{color:"#EF4444",fontSize:13,margin:"10px 0 0"}}>Usuário ou PIN incorreto</p>}
        <button onClick={handleSubmit} style={{width:"100%",marginTop:18,padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>Entrar</button>
      </div>
      <div style={{textAlign:"center",marginTop:28,opacity:0.4}}>
        <p style={{fontSize:11,color:c.textSub,margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
        <p style={{fontSize:10,color:c.textMuted,margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

/* ─── Progress Ring ─── */
function ProgressRing({percent,color,size=48,c}){
  const r=(size-6)/2,circ=2*Math.PI*r,offset=circ-(percent/100)*circ;
  const trackColor = c ? c.progressRingBg : "rgba(255,255,255,0.08)";
  const textFill = c ? c.text : "#fff";
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth="4"/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)"}}/><text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{transform:"rotate(90deg)",transformOrigin:"center",fontSize:size<44?11:13,fill:textFill,fontWeight:700}}>{percent}%</text></svg>);
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

/* ─── Task Item ─── */
function TaskItem({task,color,onToggle,onUpdate,onDelete,projectName,onMoveWeek,onEditingChange,openTaskId,onOpen,c,projects,showCategoryPicker}){
  const showOpts = openTaskId === task.id;
  const [editText,setEditText]=useState(task.text);
  const [isEditing,setIsEditing]=useState(false);
  useEffect(()=>{
    if(!showOpts)return;
    const handler=(e)=>{
      if(e.key==="Escape"){
        e.stopPropagation();
        if(isEditing){setEditText(task.text);setIsEditing(false);}
        else{if(onOpen)onOpen(null);}
      }
    };
    window.addEventListener("keydown",handler,true);
    return()=>window.removeEventListener("keydown",handler,true);
  },[showOpts,isEditing]);
  const dayInfo=WEEK_DAYS.find(d=>d.key===task.day);
  const saveText=()=>{if(editText.trim()&&editText.trim()!==task.text)onUpdate({text:editText.trim()});setIsEditing(false);};
  const toggleOpts=()=>{const next=!showOpts;if(onOpen)onOpen(next?task.id:null);if(onEditingChange)onEditingChange(next);};
  const tc = c || themes.dark;
  return(
    <div className="task-card" style={{borderRadius:12,overflow:"hidden",background:task.done?tc.taskBgDone:tc.taskBg,border:`1px solid ${task.done?tc.taskBorderDone:tc.taskBorder}`,opacity:task.done?0.55:1}}>
      <div style={{padding:"10px 12px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div onClick={onToggle} style={{width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",border:task.done?"none":`2px solid ${color}`,background:task.done?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease",marginTop:1}}>
            {task.done&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <span onClick={onToggle} style={{fontSize:13.5,lineHeight:1.4,color:tc.text,cursor:"pointer",textDecoration:task.done?"line-through":"none",fontFamily:F,display:"block"}}>{task.text}</span>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5,flexWrap:"wrap"}}>
              {projectName&&<span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:4,background:`${color}20`,color,fontFamily:F,whiteSpace:"nowrap"}}>{projectName}</span>}
              {dayInfo&&!projectName&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,background:tc.tagBg,color:tc.tagColor,fontFamily:F}}>{dayInfo.label}</span>}
              <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:priorityConfig[task.priority].dot}}/>
            </div>
          </div>
          <div onClick={e=>{e.stopPropagation();toggleOpts();}} style={{cursor:"pointer",padding:"2px 4px",opacity:0.5,transition:"opacity 0.2s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </div>
        </div>
      </div>
      {showOpts&&(
        <div draggable={false} onDragStart={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{padding:"8px 12px 12px",borderTop:`1px solid ${tc.divider}`,animation:"fadeIn 0.2s ease"}}>
          <div style={{marginBottom:10}}>
            <span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Descrição</span>
            {isEditing?(<div style={{display:"flex",flexDirection:"column",gap:6}}><textarea autoFocus value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveText();}if(e.key==="Escape"){setEditText(task.text);setIsEditing(false);}}} rows={Math.max(2,editText.split("\n").length)} style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",fontSize:12,borderRadius:8,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,resize:"none",lineHeight:1.5,overflow:"hidden"}}/><button onClick={saveText} style={{alignSelf:"flex-end",padding:"5px 14px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>OK</button></div>)
            :(<button onClick={()=>setIsEditing(true)} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"6px 10px",borderRadius:8,background:tc.inputBg,border:`1px solid ${tc.cardBorder}`,color:tc.textSub,fontSize:12,cursor:"pointer",fontFamily:F,width:"100%",textAlign:"left",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>✏️ {task.text}</button>)}
          </div>
          {/* Categoria (só na view dias da semana) */}
          {showCategoryPicker&&projects&&projects.length>0&&(
            <div style={{marginBottom:8}}>
              <span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Categoria</span>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {projects.map(p=>(<button key={p.id} onClick={()=>onUpdate({_newProjectId:p.id})} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:10,fontWeight:600,borderRadius:6,border:`1px solid ${task._projectId===p.id?p.color:tc.cardBorder}`,cursor:"pointer",fontFamily:F,background:task._projectId===p.id?`${p.color}20`:tc.inputBg,color:task._projectId===p.id?p.color:tc.textSub,transition:"all 0.15s ease"}}><span style={{fontSize:12}}>{p.emoji}</span>{p.name}</button>))}
              </div>
            </div>
          )}
          <div style={{marginBottom:8}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Dia</span><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>onUpdate({day:d.key})} style={{padding:"4px 7px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.day===d.key?color:tc.inputBg,color:task.day===d.key?"#fff":tc.textSub,transition:"all 0.15s ease"}}>{d.label}</button>))}</div></div>
          <div style={{marginBottom:onMoveWeek?10:0}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Prioridade</span><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>onUpdate({priority:k})} style={{padding:"4px 10px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.priority===k?v.dot:v.bg,color:task.priority===k?"#fff":v.dot,transition:"all 0.15s ease"}}>{v.label}</button>))}</div></div>
          {onMoveWeek&&(<div style={{marginBottom:10}}><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Semana</span>{onMoveWeek}</div>)}
          {onDelete&&(<div style={{paddingTop:6,borderTop:`1px solid ${tc.divider}`}}><button onClick={onDelete} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${tc.deleteDangerBorder}`,background:tc.deleteDangerBg,color:"#EF4444",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Excluir tarefa</button></div>)}
        </div>
      )}
    </div>
  );
}

/* ─── Add Task (com seletor de categoria opcional) ─── */
function AddTaskInput({color,onAdd,c,projects,requireCategory,defaultDay}){
  const todayKey=WEEK_DAYS_ORDER[new Date().getDay()];
  const [isOpen,setIsOpen]=useState(false);
  const [text,setText]=useState("");
  const [day,setDay]=useState(defaultDay||todayKey);
  const [priority,setPriority]=useState("low");
  const [projectId,setProjectId]=useState(()=>projects&&projects.length>0?projects[0].id:"");
  const handleAdd=()=>{
    if(!text.trim())return;
    if(requireCategory&&!projectId)return;
    onAdd(text.trim(),day,priority,requireCategory?projectId:undefined);
    setText("");setDay(defaultDay||todayKey);setPriority("low");
    setProjectId(projects&&projects.length>0?projects[0].id:"");
    setIsOpen(false);
  };
  const reset=()=>{setIsOpen(false);setText("");setDay(defaultDay||todayKey);setPriority("low");setProjectId(projects&&projects.length>0?projects[0].id:"");};
  const tc = c || themes.dark;
  const selectedProject = requireCategory&&projects ? projects.find(p=>p.id===projectId) : null;
  const activeColor = selectedProject ? selectedProject.color : (color||"#3B82F6");

  if(!isOpen) return(<button onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"9px 14px",borderRadius:10,cursor:"pointer",background:"transparent",border:`1px dashed ${tc.addTaskBorder}`,color:tc.addTaskColor,fontSize:13,fontWeight:500,fontFamily:F,transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=activeColor;e.currentTarget.style.color=activeColor;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=tc.addTaskBorder;e.currentTarget.style.color=tc.addTaskColor;}}>+ Nova tarefa</button>);

  return(
    <div style={{borderRadius:12,overflow:"hidden",background:tc.taskBg,border:`1px solid ${activeColor}30`,animation:"fadeIn 0.2s ease"}}>
      <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6}}>
          <textarea autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleAdd();}if(e.key==="Escape")reset();}} placeholder="Descreva a tarefa..." rows={Math.max(2,text.split("\n").length)} style={{flex:1,minWidth:0,padding:"8px 12px",fontSize:13,borderRadius:8,background:tc.inputBg,border:`1px solid ${activeColor}40`,color:tc.inputText,outline:"none",fontFamily:F,resize:"none",lineHeight:1.5,overflow:"hidden"}}/>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={handleAdd} style={{flexShrink:0,padding:"8px 12px",borderRadius:8,border:"none",cursor:"pointer",background:activeColor,color:"#fff",fontSize:13,fontWeight:600,fontFamily:F}}>+</button>
            <button onClick={reset} style={{flexShrink:0,padding:"8px 10px",borderRadius:8,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.cancelColor,fontSize:13,cursor:"pointer",fontFamily:F}}>✕</button>
          </div>
        </div>
        {/* Seletor de categoria (na view dias da semana) */}
        {requireCategory&&(
          <div>
            <span style={{fontSize:9,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Categoria</span>
            {projects&&projects.length>0?(
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {projects.map(p=>(<button key={p.id} onClick={()=>setProjectId(p.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:10,fontWeight:600,borderRadius:6,border:`1px solid ${projectId===p.id?p.color:tc.cardBorder}`,cursor:"pointer",fontFamily:F,background:projectId===p.id?`${p.color}20`:tc.inputBg,color:projectId===p.id?p.color:tc.textSub,transition:"all 0.15s"}}><span style={{fontSize:12}}>{p.emoji}</span>{p.name}</button>))}
              </div>
            ):(
              <div style={{padding:"8px 10px",borderRadius:8,background:tc.inputBg,border:`1px solid ${tc.cardBorder}`,fontSize:11,color:tc.textMuted,fontFamily:F}}>
                ⚠️ Nenhuma categoria criada. Vá para a aba <strong style={{color:tc.textSub}}>Categorias</strong> e crie uma primeiro.
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div>
            <span style={{fontSize:9,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Dia</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>setDay(d.key)} style={{padding:"3px 6px",fontSize:10,fontWeight:600,borderRadius:5,border:"none",cursor:"pointer",fontFamily:F,background:day===d.key?activeColor:tc.inputBg,color:day===d.key?"#fff":tc.textSub}}>{d.label}</button>))}</div>
          </div>
          <div>
            <span style={{fontSize:9,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Prioridade</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>setPriority(k)} style={{padding:"3px 9px",fontSize:10,fontWeight:600,borderRadius:5,border:"none",cursor:"pointer",fontFamily:F,background:priority===k?v.dot:v.bg,color:priority===k?"#fff":v.dot}}>{v.label}</button>))}</div>
          </div>
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
    <div onClick={()=>{setVal(title||defaultTitle);setEditing(true);}} style={{textAlign:"center",cursor:"pointer",padding:"2px 0",borderRadius:8,transition:"all 0.15s ease"}}
      title="Clique para editar o nome da semana"
      onMouseEnter={e=>{e.currentTarget.style.opacity="0.8";}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
      <div style={{display:"inline-flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:15,fontWeight:700,color:tc.text,fontFamily:F,letterSpacing:"0.01em"}}>{displayTitle}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{opacity:0.6,flexShrink:0}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </div>
      {title&&<div style={{fontSize:9,color:color,fontFamily:F,opacity:0.55,marginTop:1,letterSpacing:"0.03em"}}>{defaultTitle}</div>}
    </div>
  );
}

/* ─── Project Card ─── */
function ProjectCard({project,onToggleTask,onUpdateTask,onDeleteTask,onAddTask,onEditProject,onDeleteProject,isExpanded,onToggleExpand,reorderMode,onMoveUp,onMoveDown,isFirst,isLast,taskMoveWeek,openTaskId,onOpen,c}){
  const done=project.tasks.filter(t=>t.done).length,total=project.tasks.length;
  const percent=total>0?Math.round((done/total)*100):0,allDone=done===total&&total>0;
  const [nameVal,setNameVal]=useState(project.name);
  const [emojiVal,setEmojiVal]=useState(project.emoji);
  const [showEdit,setShowEdit]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const saveName=()=>{if(nameVal.trim()&&nameVal.trim()!==project.name)onEditProject({name:nameVal.trim()});};
  const saveEmoji=()=>{if(emojiVal.trim()&&emojiVal.trim()!==project.emoji)onEditProject({emoji:emojiVal.trim()});};
  const tc = c || themes.dark;
  return(
    <>
    {showDeleteConfirm&&<ConfirmDeleteModal title={`Excluir "${project.name}"?`} description={`Essa ação vai excluir a categoria e todas as ${total} tarefa(s) dentro dela. Essa ação não pode ser desfeita.`} onConfirm={()=>{setShowDeleteConfirm(false);onDeleteProject();}} onCancel={()=>setShowDeleteConfirm(false)} c={tc}/>}
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
          {/* Botão excluir categoria */}
          <div style={{paddingTop:4,borderTop:`1px solid ${tc.divider}`}}>
            <button onClick={()=>setShowDeleteConfirm(true)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${tc.deleteDangerBorder}`,background:tc.deleteDangerBg,color:"#EF4444",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F,transition:"all 0.2s"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Excluir categoria
            </button>
          </div>
        </div>
      </div>)}
      {isExpanded&&(<div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:6}}>{[...project.tasks].sort((a,b)=>{const d=WEEK_DAYS_ORDER.indexOf(a.day)-WEEK_DAYS_ORDER.indexOf(b.day);if(d!==0)return d;const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;return a.text.localeCompare(b.text,"pt-BR");}).map(task=>(<TaskItem key={task.id} task={task} color={project.color} onToggle={()=>onToggleTask(project.id,task.id)} onUpdate={u=>onUpdateTask(project.id,task.id,u)} onDelete={()=>onDeleteTask(project.id,task.id)} onMoveWeek={taskMoveWeek?taskMoveWeek(project.id,task.id):null} openTaskId={openTaskId} onOpen={onOpen} c={tc}/>))}<AddTaskInput color={project.color} onAdd={(text,day,priority)=>onAddTask(project.id,text,day,priority)} c={tc}/></div>)}
    </div>
    </>
  );
}

/* ─── Add Category ─── */
function AddCategoryCard({onAdd,c}){
  const [isOpen,setIsOpen]=useState(false);const [name,setName]=useState("");const [color,setColor]=useState(COLOR_OPTIONS[0]);const [emoji,setEmoji]=useState("📌");
  const handleAdd=()=>{if(name.trim()){onAdd({name:name.trim(),color,emoji});setName("");setColor(COLOR_OPTIONS[0]);setEmoji("📌");setIsOpen(false);}};
  const tc = c || themes.dark;
  if(!isOpen) return(<button className="add-cat-btn" onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"16px",borderRadius:16,cursor:"pointer",background:"transparent",border:`2px dashed ${tc.addCatBorder}`,color:tc.addCatColor,fontSize:14,fontWeight:600,fontFamily:F}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.4)";e.currentTarget.style.color="#3B82F6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=tc.addCatBorder;e.currentTarget.style.color=tc.addCatColor;}}>+ Nova categoria</button>);
  return(<div style={{background:tc.cardBg,borderRadius:16,border:`1px solid ${tc.cardBorder}`,padding:20,animation:"fadeIn 0.2s ease"}}><span style={{fontSize:14,fontWeight:700,color:tc.text,fontFamily:F,display:"block",marginBottom:14}}>Nova Categoria</span><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Ícone</span><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:48,height:48,borderRadius:12,background:`${color}20`,border:`2px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{emoji}</div><input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder="Cole um emoji..." style={{flex:1,padding:"10px 12px",fontSize:18,borderRadius:10,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,textAlign:"center"}}/></div><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Nome</span><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Nome da categoria..." style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:14,borderRadius:10,background:tc.inputBg,border:`1px solid ${color}40`,color:tc.inputText,outline:"none",fontFamily:F,marginBottom:12}}/><span style={{fontSize:10,color:tc.textMuted,fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Cor</span><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>{COLOR_OPTIONS.map(col=>(<button key={col} onClick={()=>setColor(col)} style={{width:28,height:28,borderRadius:8,border:color===col?`3px solid ${tc.text}`:"3px solid transparent",background:col,cursor:"pointer"}}/>))}</div><div style={{display:"flex",gap:8}}><button onClick={handleAdd} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:color,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Criar</button><button onClick={()=>setIsOpen(false)} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${tc.cardBorder}`,background:tc.cancelBg,color:tc.cancelColor,fontSize:14,cursor:"pointer",fontFamily:F}}>Cancelar</button></div></div>);
}

/* ─── History Card ─── */
function HistoryCard({record,onDelete,c}){
  const [expanded,setExpanded]=useState(false);
  const dateStr=new Date(record.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
  const tc = c || themes.dark;
  return(
    <div className="project-card" style={{background:tc.cardBg,borderRadius:14,border:`1px solid ${tc.cardBorder}`,overflow:"hidden"}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",cursor:"pointer",userSelect:"none"}}>
        <div style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:tc.historyIconBg,fontSize:16,color:tc.historyIconColor}}>✓</div>
        <div style={{flex:1}}><span style={{fontSize:13,fontWeight:700,color:tc.text,fontFamily:F,display:"block"}}>{record.week}</span><span style={{fontSize:11,color:tc.textMuted,fontFamily:F}}>{dateStr} — {record.total} tarefas</span></div>
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
  const saveName=()=>{if(nameVal.trim()&&nameVal.trim()!==p.name)onEditProject({name:nameVal.trim()});};
  const saveEmoji=()=>{if(emojiVal.trim()&&emojiVal.trim()!==p.emoji)onEditProject({emoji:emojiVal.trim()});};
  const tc = c || themes.dark;
  return(
    <>
    {showDeleteConfirm&&<ConfirmDeleteModal title={`Excluir "${p.name}"?`} description={`Essa ação vai excluir a categoria e todas as ${total} tarefa(s). Não pode ser desfeita.`} onConfirm={()=>{setShowDeleteConfirm(false);onDeleteProject();}} onCancel={()=>setShowDeleteConfirm(false)} c={tc}/>}
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
            Excluir categoria
          </button>
        </div>)}
        {reorderMode&&(<div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8}}>
          <button onClick={()=>onMoveProject(idx,-1)} disabled={idx===0} style={{background:"none",border:`1px solid ${tc.reorderBorder}`,borderRadius:6,cursor:idx===0?"default":"pointer",opacity:idx===0?0.2:0.7,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,color:tc.textSub,fontSize:10,fontFamily:F}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>←</button>
          <button onClick={()=>onMoveProject(idx,1)} disabled={idx===projectsLen-1} style={{background:"none",border:`1px solid ${tc.reorderBorder}`,borderRadius:6,cursor:idx===projectsLen-1?"default":"pointer",opacity:idx===projectsLen-1?0.2:0.7,padding:"3px 8px",display:"flex",alignItems:"center",gap:4,color:tc.textSub,fontSize:10,fontFamily:F}}>→<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tc.textSub} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>)}
      </div>
      <div style={{padding:"8px 8px 12px",display:"flex",flexDirection:"column",gap:5}}>
        {[...p.tasks].sort((a,b)=>{const d=WEEK_DAYS_ORDER.indexOf(a.day)-WEEK_DAYS_ORDER.indexOf(b.day);if(d!==0)return d;const o={high:0,medium:1,low:2};const pr=o[a.priority]-o[b.priority];if(pr!==0)return pr;return a.text.localeCompare(b.text,"pt-BR");}).map(task=>(<TaskItem key={task.id} task={task} color={p.color} onToggle={()=>onToggleTask(p.id,task.id)} onUpdate={u=>onUpdateTask(p.id,task.id,u)} onDelete={()=>onDeleteTask(p.id,task.id)} onMoveWeek={taskMoveWeekFn(p.id,task.id)} openTaskId={openTaskId} onOpen={onOpen} c={tc}/>))}
        <AddTaskInput color={p.color} onAdd={(text,day,priority)=>onAddTask(p.id,text,day,priority)} c={tc}/>
      </div>
    </div>
    </>
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
  const [loading,setLoading]=useState(true);
  const [viewMode,setViewMode]=useState("category");
  const [reorderMode,setReorderMode]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [dragTask,setDragTask]=useState(null);
  const [editingTasks,setEditingTasks]=useState(new Set());
  const [openTaskId,setOpenTaskId]=useState(null);
  const [dragOverDay,setDragOverDay]=useState(null);
  const [layoutMode,setLayoutMode]=useState("list");
  const [focosOpen,setFocosOpen]=useState(true);

  // Preferências por usuário — carregadas e salvas com userName na chave
  function loadUserPrefs(user){
    try{const v=localStorage.getItem(`planner-${user}-viewMode`);if(v)setViewMode(v);}catch{}
    try{const l=localStorage.getItem(`planner-${user}-layoutMode`);if(l==="columns"&&window.innerWidth>=768)setLayoutMode("columns");else if(l==="list")setLayoutMode("list");}catch{}
    try{const f=localStorage.getItem(`planner-${user}-focosOpen`);if(f!==null)setFocosOpen(f==="true");}catch{}
  }
  useEffect(()=>{if(!userName)return;try{localStorage.setItem(`planner-${userName}-viewMode`,viewMode);}catch{}},[viewMode,userName]);
  useEffect(()=>{if(!userName)return;try{localStorage.setItem(`planner-${userName}-layoutMode`,layoutMode);}catch{}},[layoutMode,userName]);
  useEffect(()=>{if(!userName)return;try{localStorage.setItem(`planner-${userName}-focosOpen`,String(focosOpen));}catch{}},[focosOpen,userName]);
  useEffect(()=>{(async()=>{try{const r=await window.storage.get(AUTH_KEY);if(r&&r.value==="true"){setAuthed(true);try{const u=await window.storage.get(USER_KEY);if(u&&u.value){setUserName(u.value);loadUserPrefs(u.value);}}catch{}}}catch{}})();},[]);
  const handleLogin=useCallback(user=>{setAuthed(true);setUserName(user);loadUserPrefs(user);window.storage.set(AUTH_KEY,"true").catch(()=>{});window.storage.set(USER_KEY,user).catch(()=>{});},[]);
  const handleLogout=useCallback(()=>{setAuthed(false);setUserName("");setWeeks([]);setLoading(true);window.storage.set(AUTH_KEY,"false").catch(()=>{});window.storage.set(USER_KEY,"").catch(()=>{});},[]);

  useEffect(()=>{
    if(!authed||!userName)return;
    const XANDE_DEFAULT_IDS=["dexan","ministerio","gc","teologia","extras"];
    const hasXandeDefaults=(wks)=>wks.some(w=>w.projects.some(p=>XANDE_DEFAULT_IDS.includes(p.id)));
    (async()=>{
      try{
        const r=await window.storage.get(userDataKey(userName));
        if(r&&r.value){
          const parsed=JSON.parse(r.value);
          // Se não é xande mas tem dados dos projetos padrão do xande, limpa tudo
          if(userName!=="xande"&&hasXandeDefaults(parsed)){
            const sun=getSunday(new Date());const sat=getSaturday(new Date());
            const clean=[{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:[]}];
            setWeeks(clean);
            window.storage.set(userDataKey(userName),JSON.stringify(clean)).catch(()=>{});
            window.storage.set(userHistoryKey(userName),JSON.stringify([])).catch(()=>{});
            setHistory([]);setLoading(false);return;
          }
          setWeeks(parsed);
        }else{
          const sun=getSunday(new Date());const sat=getSaturday(new Date());
          setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:getDefaultProjects(userName)}]);
        }
      }catch{const sun=getSunday(new Date());const sat=getSaturday(new Date());setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:getDefaultProjects(userName)}]);}
      try{const h=await window.storage.get(userHistoryKey(userName));if(h&&h.value)setHistory(JSON.parse(h.value));else setHistory([]);}catch{setHistory([]);}
      setLoading(false);
    })();
  },[authed,userName]);

  useEffect(()=>{if(weeks.length>0&&!loading&&userName)window.storage.set(userDataKey(userName),JSON.stringify(weeks)).catch(()=>{});},[weeks,loading,userName]);
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

  const addTask=useCallback((pid,text,day,priority)=>updateProjects(ps=>ps.map(p=>{if(p.id!==pid)return p;return{...p,tasks:[...p.tasks,{id:`${p.id}_${Date.now()}`,text,done:false,priority:priority||"medium",day:day||"seg"}]};})),[updateProjects]);
  const deleteTask=useCallback((pid,tid)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,tasks:p.tasks.filter(t=>t.id!==tid)}:p)),[updateProjects]);

  // addTaskToProject: usado na view dias da semana (pid vem do seletor de categoria)
  const addTaskToProject=useCallback((text,day,priority,pid)=>{
    if(!pid)return;
    addTask(pid,text,day,priority);
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

  const addNextWeek=useCallback(()=>{const last=weeks[weeks.length-1];const lastSun=last?new Date(last.sun):getSunday(new Date());const nextSun=addWeeks(lastSun,1);const nextSat=getSaturday(nextSun);const empty=projects.map(p=>({...p,tasks:[]}));setWeeks(prev=>[...prev,{id:weekId(nextSun),sun:nextSun.toISOString(),sat:nextSat.toISOString(),projects:empty}]);},[weeks,projects]);

  const canComplete=projects.some(p=>p.tasks.some(t=>t.done));
  const confirmComplete=useCallback(()=>{if(!userName)return;const curTitle=weeks[activeWeekIdx]?.title||fmtWeekLabel(currentSun,currentSat);const rec={week:curTitle,date:new Date().toISOString(),projects:projects.map(p=>{const d=p.tasks.filter(t=>t.done);return d.length>0?{name:p.name,emoji:p.emoji,color:p.color,tasks:d.map(t=>({text:t.text,day:t.day,priority:t.priority}))}:null;}).filter(Boolean)};rec.total=rec.projects.reduce((s,p)=>s+p.tasks.length,0);const newH=[rec,...history].slice(0,52);setHistory(newH);window.storage.set(userHistoryKey(userName),JSON.stringify(newH)).catch(()=>{});setWeeks(prev=>{const arr=[...prev];arr[activeWeekIdx]={...arr[activeWeekIdx],projects:arr[activeWeekIdx].projects.map(p=>({...p,tasks:p.tasks.filter(t=>!t.done)}))};if(arr[1]&&!arr[1].title){const nSun=new Date(arr[1].sun);const nSat=new Date(arr[1].sat);arr[1]={...arr[1],title:fmtWeekLabel(nSun,nSat)};}return arr;});setShowConfirm(false);},[projects,userName,history,currentSun,currentSat,activeWeekIdx,weeks]);
  const deleteHistoryEntry=useCallback(i=>{const n=history.filter((_,j)=>j!==i);setHistory(n);window.storage.set(userHistoryKey(userName),JSON.stringify(n)).catch(()=>{});},[history,userName]);

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
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.task-card{transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}.task-card:hover{transform:translateY(-1px);box-shadow:0 4px 20px ${c.hoverShadow};border-color:${c.hoverBorder}!important}.project-card{transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}.project-card:hover{box-shadow:0 6px 28px ${c.hoverShadow};border-color:${c.hoverBorder}!important}.logout-btn{transition:all 0.25s ease}.logout-btn:hover{background:rgba(239,68,68,0.08)!important;border-color:rgba(239,68,68,0.35)!important;box-shadow:0 0 16px rgba(239,68,68,0.12)}.theme-btn{transition:all 0.25s ease}.theme-btn:hover{background:rgba(59,130,246,0.08)!important;border-color:rgba(59,130,246,0.35)!important;box-shadow:0 0 16px rgba(59,130,246,0.15)}.theme-btn:hover svg{stroke:#3B82F6}@media(max-width:767px){.layout-toggle{display:none!important}}`}</style>

      <div style={{maxWidth:layoutMode==="columns"?1200:520,margin:"0 auto",padding:"24px 16px 40px",transition:"max-width 0.3s ease"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <Logo theme={theme.mode} />
            {userName&&<p style={{fontSize:13,color:c.textSub,margin:"8px 0 0",fontWeight:500}}>Seja bem-vindo, <span style={{color:"#3B82F6",fontWeight:700}}>{userName}</span></p>}
            <p style={{fontSize:11,color:c.textMuted,margin:"4px 0 0"}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>
            <p style={{fontSize:10,color:c.textDim,margin:"5px 0 0",fontStyle:"italic",lineHeight:1.5}}>💡 Dica: nomes curtos nas categorias e tarefas deixam tudo mais fácil de ler e acompanhar.</p>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="theme-btn" onClick={theme.toggle} style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}} title={theme.mode==="dark"?"Modo claro":"Modo escuro"}>{theme.mode==="dark"?(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>):(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>)}</button>
            <button className="logout-btn" onClick={handleLogout} title="Sair" style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,borderRadius:10,padding:"8px 10px",cursor:"pointer"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
          </div>
        </div>

        {/* Week Selector */}
        <div style={{background:isCurrentWeek?c.weekBg:c.weekNextBg,border:`1px solid ${c.cardBorder}`,borderRadius:16,padding:"16px 20px",marginBottom:16,transition:"all 0.3s ease"}}>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {weeks.map((w,i)=>(<button key={w.id} onClick={()=>setActiveWeekIdx(i)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:600,background:activeWeekIdx===i?(i===0?c.weekTabActive0:c.weekTabActive1):c.weekTabInactive,color:activeWeekIdx===i?(i===0?c.weekTabColor0:c.weekTabColor1):c.weekTabColorInactive,transition:"all 0.2s"}}>{i===0?"Atual":"Próxima"}</button>))}
          </div>
          <WeekTitleEditor
            title={weeks[activeWeekIdx]?.title||""}
            defaultTitle={fmtWeekLabel(currentSun,currentSat)}
            color={isCurrentWeek?c.weekTabColor0:c.weekTabColor1}
            c={c}
            onSave={t=>updateWeekTitle(activeWeekIdx,t)}
          />
          {(()=>{const highTasks=projects.flatMap(p=>p.tasks.filter(t=>t.priority==="high").map(t=>({...t,_projectEmoji:p.emoji,_projectColor:p.color})));if(highTasks.length===0)return null;const focosColor=isCurrentWeek?c.weekTabColor0:c.weekTabColor1;const focosBg=isCurrentWeek?"rgba(59,130,246,0.12)":"rgba(139,92,246,0.12)";return(<div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${c.divider}`}}><div onClick={()=>setFocosOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:focosOpen?8:0,cursor:"pointer",userSelect:"none"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={focosColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><div style={{display:"flex",flexDirection:"column",gap:1}}><span style={{fontSize:11,fontWeight:700,color:focosColor,fontFamily:F,textTransform:"uppercase",letterSpacing:"0.06em"}}>Focos da semana</span><span style={{fontSize:9,fontWeight:500,color:focosColor,fontFamily:F,opacity:0.6,letterSpacing:"0.02em"}}>Tarefas com alta prioridade</span></div><span style={{fontSize:10,fontWeight:600,color:focosColor,background:focosBg,borderRadius:5,padding:"1px 6px",fontFamily:F}}>{highTasks.filter(t=>!t.done).length}/{highTasks.length}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={focosColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:"auto",transition:"transform 0.2s ease",transform:focosOpen?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg></div>{focosOpen&&<div style={{display:"flex",flexDirection:"column",gap:5,animation:"fadeIn 0.2s ease"}}>{highTasks.map((t,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,opacity:t.done?0.35:1,transition:"opacity 0.3s ease"}}><div style={{width:6,height:6,borderRadius:"50%",background:t.done?"transparent":t._projectColor,border:t.done?`1.5px solid ${t._projectColor}40`:"none",flexShrink:0}}/><span style={{fontSize:12,color:t.done?c.textMuted:c.textSub,fontFamily:F,lineHeight:1.4,flex:1,textDecoration:t.done?"line-through":"none"}}>{t.text}</span><span style={{fontSize:10,fontFamily:F,color:t.done?c.textMuted:t._projectColor,background:t.done?c.tagBg:`${t._projectColor}18`,padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{t._projectEmoji}</span></div>))}</div>}</div>);})()}
        </div>

        {/* Global Progress */}
        <div style={{background:isCurrentWeek?c.progressBg:c.progressNextBg,border:`1px solid ${c.cardBorder}`,borderRadius:16,padding:"20px 24px",display:"flex",alignItems:"center",gap:20,marginBottom:16,transition:"all 0.3s ease"}}>
          <ProgressRing percent={globalPercent} color={globalPercent===100?"#10B981":(isCurrentWeek?"#3B82F6":"#7C3AED")} size={64} c={c}/>
          <div><div style={{fontSize:22,fontWeight:700,color:c.text}}>{doneTasks} de {totalTasks}</div><div style={{fontSize:13,color:c.textSub,marginTop:2}}>tarefas concluídas</div></div>
        </div>

        {/* View Toggle */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{display:"flex",background:c.viewToggleBg,borderRadius:10,border:`1px solid ${c.viewToggleBorder}`,overflow:"hidden",flex:1}}>
            <button onClick={()=>{setViewMode("category");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="category"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="category"?"#3B82F6":c.textMuted}}>Categorias</button>
            <button onClick={()=>{setViewMode("weekday");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="weekday"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="weekday"?"#3B82F6":c.textMuted}}>Dias da Semana</button>
          </div>
          {viewMode==="category"&&(<button onClick={()=>setReorderMode(!reorderMode)} style={{background:reorderMode?"rgba(59,130,246,0.15)":c.btnBg,border:`1px solid ${reorderMode?"rgba(59,130,246,0.3)":c.btnBorder}`,borderRadius:10,padding:"9px 10px",cursor:"pointer"}}>{layoutMode==="columns"?(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reorderMode?"#3B82F6":c.textMuted} strokeWidth="2" strokeLinecap="round"><polyline points="3 12 21 12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>):(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reorderMode?"#3B82F6":c.textMuted} strokeWidth="2" strokeLinecap="round"><polyline points="12 3 12 21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg>)}</button>)}
          <button onClick={()=>setLayoutMode(layoutMode==="list"?"columns":"list")} title={layoutMode==="list"?"Visualização em colunas":"Visualização em lista"} className="layout-toggle" style={{background:layoutMode==="columns"?"rgba(59,130,246,0.15)":c.btnBg,border:`1px solid ${layoutMode==="columns"?"rgba(59,130,246,0.3)":c.btnBorder}`,borderRadius:10,padding:"9px 10px",cursor:"pointer"}}>
            {layoutMode==="list"?(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textMuted} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>):(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>)}
          </button>
        </div>

        {/* Priority Legend */}
        <div style={{display:"flex",gap:16,marginBottom:14,paddingLeft:4}}>{Object.entries(priorityConfig).map(([k,v])=>(<div key={k} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:v.dot}}/><span style={{fontSize:11,color:c.legendColor,fontWeight:500}}>{v.label}</span></div>))}</div>

        {/* Content */}
        {layoutMode==="list"?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {viewMode==="category"?(<>
            {projects.map((p,idx)=>(<ProjectCard key={p.id} project={p} onToggleTask={toggleTask} onUpdateTask={updateTask} onAddTask={addTask} onDeleteTask={deleteTask} onEditProject={u=>editProject(p.id,u)} onDeleteProject={()=>deleteProject(p.id)} isExpanded={expanded[p.id]??true} onToggleExpand={()=>toggleExpand(p.id)} reorderMode={reorderMode} onMoveUp={()=>moveProject(idx,-1)} onMoveDown={()=>moveProject(idx,1)} isFirst={idx===0} isLast={idx===projects.length-1} taskMoveWeek={taskMoveWeekFn} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c}/>))}
            <AddCategoryCard onAdd={addCategory} c={c}/>
          </>):(
            <>
            {weekData.map(({day,tasks})=>(<div key={day.key} className="project-card"
              onDragOver={e=>{e.preventDefault();setDragOverDay(day.key);}}
              onDragLeave={()=>setDragOverDay(null)}
              onDrop={e=>{e.preventDefault();setDragOverDay(null);if(dragTask){updateTask(dragTask.projectId,dragTask.taskId,{day:day.key});setDragTask(null);}}}
              style={{background:dragOverDay===day.key?c.dragOverBg:c.cardBg,borderRadius:16,border:`1px solid ${dragOverDay===day.key?c.dragOverBorder:c.cardBorder}`,overflow:"hidden",transition:"all 0.2s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px"}}>
                <div style={{width:42,height:42,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:tasks.length>0?"rgba(59,130,246,0.12)":c.viewToggleBg,fontSize:13,fontWeight:700,color:tasks.length>0?"#3B82F6":c.textMuted,fontFamily:F}}>{day.label}</div>
                <div style={{flex:1}}><span style={{fontSize:16,fontWeight:700,color:c.text,fontFamily:F}}>{day.full}</span><span style={{fontSize:12,color:c.textMuted,display:"block",fontFamily:F}}>{tasks.filter(t=>t.done).length}/{tasks.length} concluídas</span></div>
                {tasks.length>0&&<ProgressRing percent={Math.round((tasks.filter(t=>t.done).length/tasks.length)*100)} color="#3B82F6" size={42} c={c}/>}
              </div>
              {tasks.length>0&&(<div style={{padding:"0 14px 6px",display:"flex",flexDirection:"column",gap:6}}>
                {[...tasks].sort((a,b)=>{const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;const pa=projects.find(x=>x.id===a._projectId);const pb=projects.find(x=>x.id===b._projectId);const pn=(pa?.name||"").localeCompare(pb?.name||"","pt-BR");if(pn!==0)return pn;return a.text.localeCompare(b.text,"pt-BR");}).map(t=>{const proj=projects.find(p=>p.id===t._projectId);return(<div key={t.id} draggable={!editingTasks.has(t.id)} onDragStart={()=>{if(!editingTasks.has(t.id))setDragTask({projectId:t._projectId,taskId:t.id});}} onDragEnd={()=>{setDragTask(null);setDragOverDay(null);}} style={{cursor:editingTasks.has(t.id)?"default":"grab",opacity:dragTask?.taskId===t.id?0.4:1,transition:"opacity 0.2s"}}><TaskItem task={t} color={proj?.color||"#64748B"} projectName={proj?.name} onToggle={()=>toggleTask(t._projectId,t.id)} onUpdate={u=>updateTask(t._projectId,t.id,u)} onDelete={()=>deleteTask(t._projectId,t.id)} onMoveWeek={taskMoveWeekFn(t._projectId,t.id)} onEditingChange={v=>{setEditingTasks(prev=>{const n=new Set(prev);if(v)n.add(t.id);else n.delete(t.id);return n;})}} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c} projects={projects} showCategoryPicker={true}/></div>);})}
              </div>)}
              <div style={{padding:"6px 14px 14px"}}>
                <AddTaskInput color="#3B82F6" onAdd={addTaskToProject} c={c} projects={projects} requireCategory={true} defaultDay={day.key}/>
              </div>
            </div>))}
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
                  {[...tasks].sort((a,b)=>{const o={high:0,medium:1,low:2};const p=o[a.priority]-o[b.priority];if(p!==0)return p;const pa=projects.find(x=>x.id===a._projectId);const pb=projects.find(x=>x.id===b._projectId);const pn=(pa?.name||"").localeCompare(pb?.name||"","pt-BR");if(pn!==0)return pn;return a.text.localeCompare(b.text,"pt-BR");}).map(t=>{const proj=projects.find(pp=>pp.id===t._projectId);return(<div key={t.id} draggable={!editingTasks.has(t.id)} onDragStart={()=>{if(!editingTasks.has(t.id))setDragTask({projectId:t._projectId,taskId:t.id});}} onDragEnd={()=>{setDragTask(null);setDragOverDay(null);}} style={{cursor:editingTasks.has(t.id)?"default":"grab",opacity:dragTask?.taskId===t.id?0.4:1,transition:"opacity 0.2s"}}><TaskItem task={t} color={proj?.color||"#64748B"} projectName={proj?.name} onToggle={()=>toggleTask(t._projectId,t.id)} onUpdate={u=>updateTask(t._projectId,t.id,u)} onDelete={()=>deleteTask(t._projectId,t.id)} onMoveWeek={taskMoveWeekFn(t._projectId,t.id)} onEditingChange={v=>{setEditingTasks(prev=>{const n=new Set(prev);if(v)n.add(t.id);else n.delete(t.id);return n;})}} openTaskId={openTaskId} onOpen={setOpenTaskId} c={c} projects={projects} showCategoryPicker={true}/></div>);})}
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
          {isCurrentWeek&&<button onClick={()=>canComplete&&setShowConfirm(true)} style={{background:canComplete?"linear-gradient(135deg,rgba(16,185,129,0.15),rgba(59,130,246,0.15))":c.btnBg,border:`1px solid ${canComplete?"rgba(16,185,129,0.25)":c.btnBorder}`,color:canComplete?"#10B981":c.textMuted,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:canComplete?"pointer":"default",fontFamily:F,fontWeight:600,opacity:canComplete?1:0.5}}>✓ Completar semana</button>}
          {weeks.length<2&&<button onClick={addNextWeek} style={{background:c.btnBg,border:`1px solid ${c.btnBorder}`,color:c.textSub,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>+ Nova semana</button>}
          <button onClick={()=>setShowHistory(!showHistory)} style={{background:showHistory?"rgba(59,130,246,0.12)":c.btnBg,border:`1px solid ${showHistory?"rgba(59,130,246,0.3)":c.btnBorder}`,color:showHistory?"#3B82F6":c.textSub,fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>📋 Histórico</button>
        </div>

        {/* Confirm Modal */}
        {showConfirm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,animation:"fadeIn 0.2s ease",padding:16}} onClick={()=>setShowConfirm(false)}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto",background:c.modalBg,border:`1px solid ${c.cardBorder}`,borderRadius:20,padding:24,boxShadow:theme.mode==="light"?"0 8px 40px rgba(0,0,0,0.15)":"0 8px 40px rgba(0,0,0,0.5)"}}>
          <h2 style={{fontSize:18,fontWeight:800,color:c.text,margin:"0 0 4px",fontFamily:FS}}>Completar semana</h2>
          <p style={{fontSize:12,color:c.textMuted,margin:"0 0 18px",fontFamily:F}}>{weeks[activeWeekIdx]?.title||fmtWeekLabel(currentSun,currentSat)}</p>
          <div style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#10B981"}}/><span style={{fontSize:12,fontWeight:700,color:"#10B981",fontFamily:F}}>Concluídas ({totalDone})</span></div>{doneProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.doneTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{fontSize:11,color:c.textSub,fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>
          {totalPending>0&&<div style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#F59E0B"}}/><span style={{fontSize:12,fontWeight:700,color:"#D97706",fontFamily:F}}>Pendentes — permanecem ({totalPending})</span></div>{pendingProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.pendingTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><div style={{width:8,height:8,borderRadius:4,border:`1.5px solid ${c.textMuted}`,flexShrink:0}}/><span style={{fontSize:11,color:c.textSub,fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>}
          <div style={{display:"flex",gap:10}}><button onClick={confirmComplete} style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#10B981,#3B82F6)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:F}}>Confirmar</button><button onClick={()=>setShowConfirm(false)} style={{padding:"12px 20px",borderRadius:12,border:`1px solid ${c.cardBorder}`,background:c.cancelBg,color:c.textSub,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button></div>
        </div></div>)}

        {/* History */}
        {showHistory&&(<div style={{marginTop:20,display:"flex",flexDirection:"column",gap:10,animation:"fadeIn 0.3s ease"}}><h3 style={{fontSize:14,fontWeight:700,color:c.textSub,margin:0,fontFamily:F}}>Semanas concluídas</h3>{history.length===0&&<p style={{fontSize:13,color:c.textMuted,fontFamily:F}}>Nenhum registro ainda.</p>}{history.map((rec,i)=>(<HistoryCard key={i} record={rec} onDelete={()=>deleteHistoryEntry(i)} c={c}/>))}</div>)}

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:32,opacity:0.35}}>
          <p style={{fontSize:11,color:c.textSub,margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
          <p style={{fontSize:10,color:c.textMuted,margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
        </div>
      </div>
    </div>
  );
}
