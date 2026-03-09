import { useState, useEffect, useCallback } from "react";

// Replace this URL with your hosted logo when deploying to GitHub
const LOGO_URL = `${import.meta.env.BASE_URL}logo.svg`;

const AUTH_KEY = "gestor-auth";
const USER_KEY = "gestor-user";
const MONTHS_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

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
function fmtWeekDisplay(sun, sat) {
  const f = d => d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
  return `${f(sun)} — ${f(sat)}`;
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

const DEFAULT_PROJECTS = [
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

const priorityConfig = {
  high:{label:"Alta",dot:"#EF4444",bg:"rgba(239,68,68,0.12)"},
  medium:{label:"Média",dot:"#F59E0B",bg:"rgba(245,158,11,0.12)"},
  low:{label:"Baixa",dot:"#6B7280",bg:"rgba(107,114,128,0.12)"},
};
const F = "'DM Sans', sans-serif";
const FS = "'Syne', sans-serif";

function Logo({ size = "normal" }) {
  if (LOGO_URL) return <img src={LOGO_URL} alt="Planner Semanal" style={{ width: size === "normal" ? 180 : 200, display: "block", marginLeft: size === "large" ? "auto" : undefined, marginRight: size === "large" ? "auto" : undefined }} />;
  const s = size === "large" ? 28 : 22;
  const s2 = size === "large" ? 16 : 13;
  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ fontFamily: FS, fontWeight: 800, fontSize: s, letterSpacing: "-0.03em", lineHeight: 1 }}>
        <span style={{ background: "linear-gradient(135deg, #7432F6, #B46EE5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PLANNER</span>
      </div>
      <div style={{ fontFamily: FS, fontWeight: 800, fontSize: s2, letterSpacing: "0.15em", color: "#94A3B8", marginTop: 2 }}>SEMANAL</div>
    </div>
  );
}

/* ─── Login ─── */
function LoginScreen({ onLogin }) {
  const [user,setUser]=useState(""); const [pin,setPin]=useState("");
  const [error,setError]=useState(false); const [shake,setShake]=useState(false);
  const handleSubmit = async () => {
    if(!user.trim()||!pin){setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);return;}
    if(await verifyCredentials(user,pin)){onLogin(user.trim().toLowerCase());}
    else{setError(true);setShake(true);setTimeout(()=>setShake(false),500);setTimeout(()=>setError(false),2000);}
  };
  return (
    <div style={{minHeight:"100vh",background:"#0B1120",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,padding:"24px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <div style={{width:340,padding:40,textAlign:"center",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:24,animation:shake?"shake 0.5s ease":"fadeIn 0.6s ease"}}>
        <div style={{ marginBottom: 16 }}><Logo size="large" /></div>
        <p style={{fontSize:13,color:"#94A3B8",margin:"0 0 24px",lineHeight:1.5}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>
        <div style={{textAlign:"left",marginBottom:12}}>
          <span style={{fontSize:11,color:"#64748B",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Usuário</span>
          <input type="text" value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&document.getElementById("pin-input")?.focus()} placeholder="seu usuário" autoFocus
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:15,background:"rgba(255,255,255,0.06)",border:`2px solid ${error?"#EF4444":"rgba(255,255,255,0.1)"}`,borderRadius:12,color:"#F1F5F9",outline:"none",fontFamily:F,transition:"border-color 0.2s ease"}}/>
        </div>
        <div style={{textAlign:"left",marginBottom:6}}>
          <span style={{fontSize:11,color:"#64748B",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>PIN</span>
          <input id="pin-input" type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="• • • •"
            style={{width:"100%",boxSizing:"border-box",marginTop:6,padding:"12px 16px",fontSize:20,textAlign:"center",background:"rgba(255,255,255,0.06)",border:`2px solid ${error?"#EF4444":"rgba(255,255,255,0.1)"}`,borderRadius:12,color:"#F1F5F9",outline:"none",fontFamily:F,letterSpacing:8,transition:"border-color 0.2s ease"}}/>
        </div>
        {error&&<p style={{color:"#FCA5A5",fontSize:13,margin:"10px 0 0"}}>Usuário ou PIN incorreto</p>}
        <button onClick={handleSubmit} style={{width:"100%",marginTop:18,padding:"14px",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",border:"none",borderRadius:14,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>Entrar</button>
      </div>
      <div style={{textAlign:"center",marginTop:28,opacity:0.4}}>
        <p style={{fontSize:11,color:"#94A3B8",margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
        <p style={{fontSize:10,color:"#64748B",margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

/* ─── Progress Ring ─── */
function ProgressRing({percent,color,size=48}){
  const r=(size-6)/2,circ=2*Math.PI*r,offset=circ-(percent/100)*circ;
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4"/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)"}}/><text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{transform:"rotate(90deg)",transformOrigin:"center",fontSize:size<44?11:13,fill:"#fff",fontWeight:700}}>{percent}%</text></svg>);
}

/* ─── Task Item ─── */
function TaskItem({task,color,onToggle,onUpdate,projectName,extraAction}){
  const [showOpts,setShowOpts]=useState(false);
  const [editText,setEditText]=useState(task.text);
  const [isEditing,setIsEditing]=useState(false);
  const dayInfo=WEEK_DAYS.find(d=>d.key===task.day);
  const saveText=()=>{if(editText.trim()&&editText.trim()!==task.text)onUpdate({text:editText.trim()});setIsEditing(false);};
  return(
    <div className="task-card" style={{borderRadius:12,overflow:"hidden",background:task.done?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.05)",border:`1px solid ${task.done?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.08)"}`,opacity:task.done?0.45:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px"}}>
        <div onClick={onToggle} style={{width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",border:task.done?"none":`2px solid ${color}`,background:task.done?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}}>
          {task.done&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
        <span onClick={onToggle} style={{flex:1,fontSize:13.5,lineHeight:1.4,color:"#E2E8F0",cursor:"pointer",textDecoration:task.done?"line-through":"none",fontFamily:F}}>{task.text}</span>
        {projectName&&<span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:4,background:`${color}20`,color,fontFamily:F,whiteSpace:"nowrap"}}>{projectName}</span>}
        {dayInfo&&!projectName&&<span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,background:"rgba(255,255,255,0.07)",color:"#94A3B8",fontFamily:F}}>{dayInfo.label}</span>}
        <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:priorityConfig[task.priority].dot}}/>
        {extraAction}
        <div onClick={e=>{e.stopPropagation();setShowOpts(!showOpts);}} style={{cursor:"pointer",padding:"2px 4px",opacity:0.5,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </div>
      </div>
      {showOpts&&(
        <div style={{padding:"8px 12px 12px",borderTop:"1px solid rgba(255,255,255,0.05)",animation:"fadeIn 0.2s ease"}}>
          <div style={{marginBottom:10}}>
            <span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Descrição</span>
            {isEditing?(<div style={{display:"flex",gap:6}}><input autoFocus value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveText();if(e.key==="Escape"){setEditText(task.text);setIsEditing(false);}}} style={{flex:1,padding:"6px 10px",fontSize:12,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${color}40`,color:"#E2E8F0",outline:"none",fontFamily:F}}/><button onClick={saveText} style={{padding:"6px 12px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>OK</button></div>)
            :(<button onClick={()=>setIsEditing(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#CBD5E1",fontSize:12,cursor:"pointer",fontFamily:F,width:"100%",textAlign:"left"}}>✏️ {task.text}</button>)}
          </div>
          <div style={{marginBottom:8}}><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Dia</span><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>onUpdate({day:d.key})} style={{padding:"4px 7px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.day===d.key?color:"rgba(255,255,255,0.06)",color:task.day===d.key?"#fff":"#94A3B8",transition:"all 0.15s ease"}}>{d.label}</button>))}</div></div>
          <div><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Prioridade</span><div style={{display:"flex",gap:4}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>onUpdate({priority:k})} style={{padding:"4px 10px",fontSize:10,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,background:task.priority===k?v.dot:v.bg,color:task.priority===k?"#fff":v.dot,transition:"all 0.15s ease"}}>{v.label}</button>))}</div></div>
        </div>
      )}
    </div>
  );
}

/* ─── Add Task ─── */
function AddTaskInput({color,onAdd}){
  const [isOpen,setIsOpen]=useState(false);const [text,setText]=useState("");const [day,setDay]=useState("seg");const [priority,setPriority]=useState("medium");
  const handleAdd=()=>{if(text.trim()){onAdd(text.trim(),day,priority);setText("");setDay("seg");setPriority("medium");setIsOpen(false);}};
  const reset=()=>{setIsOpen(false);setText("");setDay("seg");setPriority("medium");};
  if(!isOpen) return(<button onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"9px 14px",borderRadius:10,cursor:"pointer",background:"transparent",border:"1px dashed rgba(255,255,255,0.1)",color:"#64748B",fontSize:13,fontWeight:500,fontFamily:F,transition:"all 0.2s ease"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.color=color;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";e.currentTarget.style.color="#64748B";}}>+ Nova tarefa</button>);
  return(<div style={{borderRadius:12,overflow:"hidden",background:"rgba(255,255,255,0.05)",border:`1px solid ${color}30`,animation:"fadeIn 0.2s ease"}}><div style={{display:"flex",gap:8,padding:"10px 12px"}}><input autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleAdd();if(e.key==="Escape")reset();}} placeholder="Descreva a tarefa..." style={{flex:1,padding:"8px 12px",fontSize:13,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${color}40`,color:"#E2E8F0",outline:"none",fontFamily:F}}/><button onClick={handleAdd} style={{padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",background:color,color:"#fff",fontSize:13,fontWeight:600,fontFamily:F}}>+</button><button onClick={reset} style={{padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"transparent",color:"#64748B",fontSize:13,cursor:"pointer",fontFamily:F}}>✕</button></div><div style={{padding:"0 12px 10px",display:"flex",gap:12,flexWrap:"wrap"}}><div><span style={{fontSize:9,color:"#64748B",fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Dia</span><div style={{display:"flex",gap:3}}>{WEEK_DAYS.map(d=>(<button key={d.key} onClick={()=>setDay(d.key)} style={{padding:"3px 6px",fontSize:10,fontWeight:600,borderRadius:5,border:"none",cursor:"pointer",fontFamily:F,background:day===d.key?color:"rgba(255,255,255,0.06)",color:day===d.key?"#fff":"#94A3B8"}}>{d.label}</button>))}</div></div><div><span style={{fontSize:9,color:"#64748B",fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Prioridade</span><div style={{display:"flex",gap:4}}>{Object.entries(priorityConfig).map(([k,v])=>(<button key={k} onClick={()=>setPriority(k)} style={{padding:"3px 9px",fontSize:10,fontWeight:600,borderRadius:5,border:"none",cursor:"pointer",fontFamily:F,background:priority===k?v.dot:v.bg,color:priority===k?"#fff":v.dot}}>{v.label}</button>))}</div></div></div></div>);
}

/* ─── Project Card ─── */
function ProjectCard({project,onToggleTask,onUpdateTask,onAddTask,onEditProject,isExpanded,onToggleExpand,reorderMode,onMoveUp,onMoveDown,isFirst,isLast,taskExtra}){
  const done=project.tasks.filter(t=>t.done).length,total=project.tasks.length;
  const percent=total>0?Math.round((done/total)*100):0,allDone=done===total&&total>0;
  const [nameVal,setNameVal]=useState(project.name);
  const [emojiVal,setEmojiVal]=useState(project.emoji);
  const [editingEmoji,setEditingEmoji]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const saveName=()=>{if(nameVal.trim()&&nameVal.trim()!==project.name)onEditProject({name:nameVal.trim()});};
  const saveEmoji=()=>{if(emojiVal.trim()&&emojiVal.trim()!==project.emoji)onEditProject({emoji:emojiVal.trim()});setEditingEmoji(false);};
  return(
    <div className="project-card" style={{background:"rgba(255,255,255,0.04)",borderRadius:16,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 16px 16px 20px"}}>
        {reorderMode&&(<div style={{display:"flex",flexDirection:"column",gap:2,marginRight:2}}><button onClick={onMoveUp} disabled={isFirst} style={{background:"none",border:"none",cursor:isFirst?"default":"pointer",opacity:isFirst?0.2:0.7,padding:2}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg></button><button onClick={onMoveDown} disabled={isLast} style={{background:"none",border:"none",cursor:isLast?"default":"pointer",opacity:isLast?0.2:0.7,padding:2}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg></button></div>)}
        {editingEmoji?(<input autoFocus value={emojiVal} onChange={e=>setEmojiVal(e.target.value)} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Enter")saveEmoji();if(e.key==="Escape"){setEmojiVal(project.emoji);setEditingEmoji(false);}}} onBlur={saveEmoji} style={{width:42,height:42,fontSize:22,textAlign:"center",borderRadius:10,background:"rgba(255,255,255,0.06)",border:`2px solid ${project.color}`,color:"#F1F5F9",outline:"none",padding:0,fontFamily:F}}/>):(<div onClick={onToggleExpand} style={{fontSize:28,cursor:"pointer"}}>{project.emoji}</div>)}
        <div style={{flex:1,cursor:"pointer"}} onClick={onToggleExpand}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:16,fontWeight:700,color:"#F1F5F9",fontFamily:F}}>{project.name}</span></div>
          <span style={{fontSize:13,color:"#94A3B8",fontFamily:F}}>{done}/{total} concluídas</span>
        </div>
        <div onClick={e=>{e.stopPropagation();setShowEdit(!showEdit);}} style={{cursor:"pointer",padding:4,opacity:showEdit?1:0.4,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>{if(!showEdit)e.currentTarget.style.opacity="0.4";}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showEdit?project.color:"#94A3B8"} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <ProgressRing percent={percent} color={allDone?"#10B981":project.color} size={46}/>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform 0.2s ease",transform:isExpanded?"rotate(180deg)":"rotate(0deg)",cursor:"pointer"}} onClick={onToggleExpand}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {showEdit&&(<div style={{padding:"0 16px 14px",borderTop:"1px solid rgba(255,255,255,0.05)",animation:"fadeIn 0.2s ease"}}><div style={{padding:"12px 0",display:"flex",flexDirection:"column",gap:10}}><div><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Ícone</span><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:44,height:44,borderRadius:10,background:`${project.color}20`,border:`2px solid ${project.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{emojiVal}</div><input value={emojiVal} onChange={e=>setEmojiVal(e.target.value)} onBlur={saveEmoji} onKeyDown={e=>{if(e.key==="Enter")saveEmoji();}} placeholder="Emoji..." style={{flex:1,padding:"8px 12px",fontSize:18,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${project.color}40`,color:"#E2E8F0",outline:"none",fontFamily:F,textAlign:"center"}}/></div></div><div><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Nome</span><input value={nameVal} onChange={e=>setNameVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveName();}} onBlur={saveName} style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",fontSize:14,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${project.color}40`,color:"#E2E8F0",outline:"none",fontFamily:F}}/></div><div><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Cor</span><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{COLOR_OPTIONS.map(c=>(<button key={c} onClick={()=>onEditProject({color:c})} style={{width:28,height:28,borderRadius:8,cursor:"pointer",border:project.color===c?"3px solid #fff":"3px solid transparent",background:c}}/>))}</div></div></div></div>)}
      {isExpanded&&(<div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:6}}>{[...project.tasks].sort((a,b)=>WEEK_DAYS_ORDER.indexOf(a.day)-WEEK_DAYS_ORDER.indexOf(b.day)).map(task=>(<TaskItem key={task.id} task={task} color={project.color} onToggle={()=>onToggleTask(project.id,task.id)} onUpdate={u=>onUpdateTask(project.id,task.id,u)} extraAction={taskExtra?taskExtra(project.id,task.id):null}/>))}<AddTaskInput color={project.color} onAdd={(text,day,priority)=>onAddTask(project.id,text,day,priority)}/></div>)}
    </div>
  );
}

/* ─── Add Category ─── */
function AddCategoryCard({onAdd}){
  const [isOpen,setIsOpen]=useState(false);const [name,setName]=useState("");const [color,setColor]=useState(COLOR_OPTIONS[0]);const [emoji,setEmoji]=useState("📌");
  const handleAdd=()=>{if(name.trim()){onAdd({name:name.trim(),color,emoji});setName("");setColor(COLOR_OPTIONS[0]);setEmoji("📌");setIsOpen(false);}};
  if(!isOpen) return(<button className="add-cat-btn" onClick={()=>setIsOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"16px",borderRadius:16,cursor:"pointer",background:"transparent",border:"2px dashed rgba(255,255,255,0.08)",color:"#64748B",fontSize:14,fontWeight:600,fontFamily:F}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(59,130,246,0.4)";e.currentTarget.style.color="#60A5FA";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="#64748B";}}>+ Nova categoria</button>);
  return(<div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,border:"1px solid rgba(255,255,255,0.07)",padding:20,animation:"fadeIn 0.2s ease"}}><span style={{fontSize:14,fontWeight:700,color:"#F1F5F9",fontFamily:F,display:"block",marginBottom:14}}>Nova Categoria</span><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Ícone</span><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:48,height:48,borderRadius:12,background:`${color}20`,border:`2px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{emoji}</div><input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder="Cole um emoji..." style={{flex:1,padding:"10px 12px",fontSize:18,borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${color}40`,color:"#E2E8F0",outline:"none",fontFamily:F,textAlign:"center"}}/></div><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Nome</span><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Nome da categoria..." style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:14,borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${color}40`,color:"#E2E8F0",outline:"none",fontFamily:F,marginBottom:12}}/><span style={{fontSize:10,color:"#64748B",fontWeight:600,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Cor</span><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>{COLOR_OPTIONS.map(c=>(<button key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:8,border:color===c?"3px solid #fff":"3px solid transparent",background:c,cursor:"pointer"}}/>))}</div><div style={{display:"flex",gap:8}}><button onClick={handleAdd} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:color,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Criar</button><button onClick={()=>setIsOpen(false)} style={{padding:"10px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"transparent",color:"#64748B",fontSize:14,cursor:"pointer",fontFamily:F}}>Cancelar</button></div></div>);
}

/* ─── History Card ─── */
function HistoryCard({record,onDelete}){
  const [expanded,setExpanded]=useState(false);
  const dateStr=new Date(record.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
  return(
    <div className="project-card" style={{background:"rgba(255,255,255,0.04)",borderRadius:14,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden"}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",cursor:"pointer",userSelect:"none"}}>
        <div style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(16,185,129,0.12)",fontSize:16,color:"#6EE7B7"}}>✓</div>
        <div style={{flex:1}}><span style={{fontSize:13,fontWeight:700,color:"#F1F5F9",fontFamily:F,display:"block"}}>{record.week}</span><span style={{fontSize:11,color:"#64748B",fontFamily:F}}>{dateStr} — {record.total} tarefas</span></div>
        <div onClick={e=>{e.stopPropagation();if(confirm("Apagar este registro?"))onDelete();}} style={{cursor:"pointer",padding:4,opacity:0.3,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="0.3"}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform 0.2s ease",transform:expanded?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {expanded&&(<div style={{padding:"0 16px 14px",display:"flex",flexDirection:"column",gap:8,animation:"fadeIn 0.2s ease"}}>{record.projects.map((p,j)=>(<div key={j}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:16}}>{p.emoji}</span><span style={{fontSize:12,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span><span style={{fontSize:10,color:"#64748B",fontFamily:F}}>({p.tasks.length})</span></div><div style={{display:"flex",flexDirection:"column",gap:3,paddingLeft:28}}>{p.tasks.map((t,k)=>{const di=WEEK_DAYS.find(d=>d.key===t.day);return(<div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{flex:1,fontSize:12,color:"#CBD5E1",fontFamily:F}}>{t.text}</span>{di&&<span style={{fontSize:9,color:"#64748B",fontFamily:F,padding:"1px 5px",background:"rgba(255,255,255,0.05)",borderRadius:4}}>{di.label}</span>}</div>);})}</div></div>))}</div>)}
    </div>
  );
}

/* ─── Main App ─── */
export default function App(){
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
  const [dragTask,setDragTask]=useState(null); // {projectId, taskId}
  const [dragOverDay,setDragOverDay]=useState(null);

  useEffect(()=>{(async()=>{try{const r=await window.storage.get(AUTH_KEY);if(r&&r.value==="true"){setAuthed(true);try{const u=await window.storage.get(USER_KEY);if(u&&u.value)setUserName(u.value);}catch{}}}catch{}})();},[]);
  const handleLogin=useCallback(user=>{setAuthed(true);setUserName(user);window.storage.set(AUTH_KEY,"true").catch(()=>{});window.storage.set(USER_KEY,user).catch(()=>{});},[]);
  const handleLogout=useCallback(()=>{setAuthed(false);setUserName("");setWeeks([]);setLoading(true);window.storage.set(AUTH_KEY,"false").catch(()=>{});window.storage.set(USER_KEY,"").catch(()=>{});},[]);

  useEffect(()=>{
    if(!authed||!userName)return;
    (async()=>{
      try{const r=await window.storage.get(userDataKey(userName));if(r&&r.value){setWeeks(JSON.parse(r.value));}else{const sun=getSunday(new Date());const sat=getSaturday(new Date());setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:DEFAULT_PROJECTS}]);}}catch{const sun=getSunday(new Date());const sat=getSaturday(new Date());setWeeks([{id:weekId(sun),sun:sun.toISOString(),sat:sat.toISOString(),projects:DEFAULT_PROJECTS}]);}
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
  const updateTask=useCallback((pid,tid,u)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,tasks:p.tasks.map(t=>t.id===tid?{...t,...u}:t)}:p)),[updateProjects]);
  const addTask=useCallback((pid,text,day,priority)=>updateProjects(ps=>ps.map(p=>{if(p.id!==pid)return p;return{...p,tasks:[...p.tasks,{id:`${p.id}_${Date.now()}`,text,done:false,priority:priority||"medium",day:day||"seg"}]};})),[updateProjects]);
  const editProject=useCallback((pid,u)=>updateProjects(ps=>ps.map(p=>p.id===pid?{...p,...u}:p)),[updateProjects]);
  const addCategory=useCallback(({name,color,emoji})=>updateProjects(ps=>[...ps,{id:`cat_${Date.now()}`,name,emoji,color,tasks:[]}]),[updateProjects]);
  const moveProject=useCallback((index,dir)=>{
    setWeeks(prev=>{
      const arr=JSON.parse(JSON.stringify(prev));
      // Get new order from active week
      const ps=[...arr[activeWeekIdx].projects];
      const t=index+dir;
      if(t<0||t>=ps.length)return prev;
      [ps[index],ps[t]]=[ps[t],ps[index]];
      arr[activeWeekIdx].projects=ps;
      // Sync order to all other weeks
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
  const confirmComplete=useCallback(()=>{if(!userName)return;const rec={week:fmtWeekLabel(currentSun,currentSat),date:new Date().toISOString(),projects:projects.map(p=>{const d=p.tasks.filter(t=>t.done);return d.length>0?{name:p.name,emoji:p.emoji,color:p.color,tasks:d.map(t=>({text:t.text,day:t.day,priority:t.priority}))}:null;}).filter(Boolean)};rec.total=rec.projects.reduce((s,p)=>s+p.tasks.length,0);const newH=[rec,...history].slice(0,52);setHistory(newH);window.storage.set(userHistoryKey(userName),JSON.stringify(newH)).catch(()=>{});setWeeks(prev=>{const arr=[...prev];arr[activeWeekIdx]={...arr[activeWeekIdx],projects:arr[activeWeekIdx].projects.map(p=>({...p,tasks:p.tasks.filter(t=>!t.done)}))};return arr;});setShowConfirm(false);},[projects,userName,history,currentSun,currentSat,activeWeekIdx]);
  const deleteHistoryEntry=useCallback(i=>{const n=history.filter((_,j)=>j!==i);setHistory(n);window.storage.set(userHistoryKey(userName),JSON.stringify(n)).catch(()=>{});},[history,userName]);

  if(!authed) return <LoginScreen onLogin={handleLogin}/>;
  if(loading||weeks.length===0) return(<div style={{minHeight:"100vh",background:"#0B1120",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#64748B",fontSize:16,fontFamily:F}}>Carregando...</div></div>);

  const totalTasks=projects.reduce((s,p)=>s+p.tasks.length,0);
  const doneTasks=projects.reduce((s,p)=>s+p.tasks.filter(t=>t.done).length,0);
  const globalPercent=totalTasks>0?Math.round((doneTasks/totalTasks)*100):0;
  const isCurrentWeek=activeWeekIdx===0;
  const weekData=WEEK_DAYS.map(day=>{const tasks=[];projects.forEach(p=>{p.tasks.forEach(t=>{if(t.day===day.key)tasks.push({...t,_projectId:p.id});});});return{day,tasks};});

  const taskExtraFn=(pid,tid)=>{
    if(isCurrentWeek&&weeks.length>1) return(<button onClick={e=>{e.stopPropagation();moveTaskToWeek(0,1,pid,tid);}} title="Adiar" style={{background:"none",border:"none",cursor:"pointer",padding:2,opacity:0.4,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.4"}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>);
    if(!isCurrentWeek) return(<button onClick={e=>{e.stopPropagation();moveTaskToWeek(activeWeekIdx,0,pid,tid);}} title="Adiantar" style={{background:"none",border:"none",cursor:"pointer",padding:2,opacity:0.4,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.4"}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 5 5 12 12 19"/></svg></button>);
    return null;
  };

  const doneProjects=projects.map(p=>{const d=p.tasks.filter(t=>t.done);return d.length>0?{...p,doneTasks:d}:null;}).filter(Boolean);
  const pendingProjects=projects.map(p=>{const pn=p.tasks.filter(t=>!t.done);return pn.length>0?{...p,pendingTasks:pn}:null;}).filter(Boolean);
  const totalDone=doneProjects.reduce((s,p)=>s+p.doneTasks.length,0);
  const totalPending=pendingProjects.reduce((s,p)=>s+p.pendingTasks.length,0);

  return(
    <div style={{minHeight:"100vh",background:"#0B1120",fontFamily:F}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.task-card{transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}.task-card:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.15)!important;background:rgba(255,255,255,0.07)!important}.project-card{transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}.project-card:hover{box-shadow:0 6px 28px rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12)!important}.logout-btn{transition:all 0.25s ease}.logout-btn:hover{background:rgba(255,255,255,0.1)!important;border-color:rgba(239,68,68,0.35)!important;box-shadow:0 0 16px rgba(239,68,68,0.12)}`}</style>

      <div style={{maxWidth:520,margin:"0 auto",padding:"24px 16px 40px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <Logo />
            {userName&&<p style={{fontSize:13,color:"#94A3B8",margin:"8px 0 0",fontWeight:500}}>Seja bem-vindo, <span style={{color:"#60A5FA",fontWeight:700}}>{userName}</span></p>}
            <p style={{fontSize:11,color:"#64748B",margin:"4px 0 0"}}>Organize sua semana, acompanhe seus projetos e avance com velocidade!</p>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sair" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 10px",cursor:"pointer"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
        </div>

        {/* Week Selector */}
        <div style={{background:isCurrentWeek?"linear-gradient(135deg,rgba(59,130,246,0.08),rgba(139,92,246,0.08))":"linear-gradient(135deg,rgba(88,28,196,0.15),rgba(55,15,120,0.15))",border:`1px solid ${isCurrentWeek?"rgba(255,255,255,0.07)":"rgba(88,28,196,0.25)"}`,borderRadius:16,padding:"16px 20px",marginBottom:16,transition:"all 0.3s ease"}}>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {weeks.map((w,i)=>(<button key={w.id} onClick={()=>setActiveWeekIdx(i)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:600,background:activeWeekIdx===i?(i===0?"rgba(59,130,246,0.2)":"rgba(88,28,196,0.3)"):"rgba(255,255,255,0.04)",color:activeWeekIdx===i?(i===0?"#60A5FA":"#B388FF"):"#64748B",transition:"all 0.2s"}}>{i===0?"Atual":"Próxima"}</button>))}
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:700,color:"#F1F5F9",fontFamily:F,letterSpacing:"0.01em"}}>{fmtWeekLabel(currentSun,currentSat)}</div>
          </div>
        </div>

        {/* Global Progress */}
        <div style={{background:isCurrentWeek?"linear-gradient(135deg,rgba(59,130,246,0.12),rgba(139,92,246,0.12))":"linear-gradient(135deg,rgba(88,28,196,0.18),rgba(55,15,120,0.18))",border:`1px solid ${isCurrentWeek?"rgba(255,255,255,0.07)":"rgba(88,28,196,0.2)"}`,borderRadius:16,padding:"20px 24px",display:"flex",alignItems:"center",gap:20,marginBottom:16,transition:"all 0.3s ease"}}>
          <ProgressRing percent={globalPercent} color={globalPercent===100?"#10B981":(isCurrentWeek?"#3B82F6":"#7C3AED")} size={64}/>
          <div><div style={{fontSize:22,fontWeight:700,color:"#F1F5F9"}}>{doneTasks} de {totalTasks}</div><div style={{fontSize:13,color:"#94A3B8",marginTop:2}}>tarefas concluídas</div></div>
        </div>

        {/* View Toggle */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:10,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",flex:1}}>
            <button onClick={()=>{setViewMode("category");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="category"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="category"?"#60A5FA":"#64748B"}}>Categorias</button>
            <button onClick={()=>{setViewMode("weekday");setReorderMode(false);}} style={{flex:1,padding:"9px 0",fontSize:12,fontWeight:600,fontFamily:F,border:"none",cursor:"pointer",background:viewMode==="weekday"?"rgba(59,130,246,0.15)":"transparent",color:viewMode==="weekday"?"#60A5FA":"#64748B"}}>Dias da Semana</button>
          </div>
          {viewMode==="category"&&(<button onClick={()=>setReorderMode(!reorderMode)} style={{background:reorderMode?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${reorderMode?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.07)"}`,borderRadius:10,padding:"9px 10px",cursor:"pointer"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reorderMode?"#60A5FA":"#64748B"} strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>)}
        </div>

        {/* Priority Legend */}
        <div style={{display:"flex",gap:16,marginBottom:14,paddingLeft:4}}>{Object.entries(priorityConfig).map(([k,v])=>(<div key={k} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:v.dot}}/><span style={{fontSize:11,color:"#64748B",fontWeight:500}}>{v.label}</span></div>))}</div>

        {/* Content */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {viewMode==="category"?(<>
            {projects.map((p,idx)=>(<ProjectCard key={p.id} project={p} onToggleTask={toggleTask} onUpdateTask={updateTask} onAddTask={addTask} onEditProject={u=>editProject(p.id,u)} isExpanded={expanded[p.id]??true} onToggleExpand={()=>toggleExpand(p.id)} reorderMode={reorderMode} onMoveUp={()=>moveProject(idx,-1)} onMoveDown={()=>moveProject(idx,1)} isFirst={idx===0} isLast={idx===projects.length-1} taskExtra={taskExtraFn}/>))}
            <AddCategoryCard onAdd={addCategory}/>
          </>):(
            weekData.map(({day,tasks})=>(<div key={day.key} className="project-card"
              onDragOver={e=>{e.preventDefault();setDragOverDay(day.key);}}
              onDragLeave={()=>setDragOverDay(null)}
              onDrop={e=>{e.preventDefault();setDragOverDay(null);if(dragTask){updateTask(dragTask.projectId,dragTask.taskId,{day:day.key});setDragTask(null);}}}
              style={{background:dragOverDay===day.key?"rgba(59,130,246,0.12)":"rgba(255,255,255,0.04)",borderRadius:16,border:`1px solid ${dragOverDay===day.key?"rgba(59,130,246,0.4)":"rgba(255,255,255,0.07)"}`,overflow:"hidden",transition:"all 0.2s ease"}}><div style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px"}}><div style={{width:42,height:42,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:tasks.length>0?"rgba(59,130,246,0.12)":"rgba(255,255,255,0.04)",fontSize:13,fontWeight:700,color:tasks.length>0?"#60A5FA":"#475569",fontFamily:F}}>{day.label}</div><div style={{flex:1}}><span style={{fontSize:16,fontWeight:700,color:"#F1F5F9",fontFamily:F}}>{day.full}</span><span style={{fontSize:12,color:"#64748B",display:"block",fontFamily:F}}>{tasks.filter(t=>t.done).length}/{tasks.length} concluídas</span></div>{tasks.length>0&&<ProgressRing percent={Math.round((tasks.filter(t=>t.done).length/tasks.length)*100)} color="#3B82F6" size={42}/>}</div>{tasks.length>0&&(<div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:6}}>{[...tasks].sort((a,b)=>{const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];}).map(t=>{const proj=projects.find(p=>p.id===t._projectId);return(<div key={t.id} draggable onDragStart={()=>setDragTask({projectId:t._projectId,taskId:t.id})} onDragEnd={()=>{setDragTask(null);setDragOverDay(null);}} style={{cursor:"grab",opacity:dragTask?.taskId===t.id?0.4:1,transition:"opacity 0.2s"}}><TaskItem task={t} color={proj?.color||"#64748B"} projectName={proj?.name} onToggle={()=>toggleTask(t._projectId,t.id)} onUpdate={u=>updateTask(t._projectId,t.id,u)} extraAction={taskExtraFn(t._projectId,t.id)}/></div>);})}</div>)}{tasks.length===0&&(<div style={{padding:"0 20px 16px",fontSize:13,color:dragOverDay===day.key?"#60A5FA":"#475569",fontFamily:F,transition:"color 0.2s"}}>{dragOverDay===day.key?"Soltar aqui":"Nenhuma tarefa"}</div>)}</div>))
          )}
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:28,flexWrap:"wrap"}}>
          {isCurrentWeek&&<button onClick={()=>canComplete&&setShowConfirm(true)} style={{background:canComplete?"linear-gradient(135deg,rgba(16,185,129,0.15),rgba(59,130,246,0.15))":"rgba(255,255,255,0.02)",border:`1px solid ${canComplete?"rgba(16,185,129,0.25)":"rgba(255,255,255,0.05)"}`,color:canComplete?"#6EE7B7":"#475569",fontSize:12,padding:"10px 16px",borderRadius:10,cursor:canComplete?"pointer":"default",fontFamily:F,fontWeight:600,opacity:canComplete?1:0.5}}>✓ Completar semana</button>}
          {weeks.length<2&&<button onClick={addNextWeek} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748B",fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>+ Nova semana</button>}
          <button onClick={()=>setShowHistory(!showHistory)} style={{background:showHistory?"rgba(59,130,246,0.12)":"none",border:`1px solid ${showHistory?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.08)"}`,color:showHistory?"#60A5FA":"#64748B",fontSize:12,padding:"10px 16px",borderRadius:10,cursor:"pointer",fontFamily:F,fontWeight:500}}>📋 Histórico</button>
        </div>

        {/* Confirm Modal */}
        {showConfirm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,animation:"fadeIn 0.2s ease",padding:16}} onClick={()=>setShowConfirm(false)}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto",background:"#0F1729",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:24}}>
          <h2 style={{fontSize:18,fontWeight:800,color:"#F1F5F9",margin:"0 0 4px",fontFamily:FS}}>Completar semana</h2>
          <p style={{fontSize:12,color:"#64748B",margin:"0 0 18px",fontFamily:F}}>{fmtWeekLabel(currentSun,currentSat)}</p>
          <div style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#10B981"}}/><span style={{fontSize:12,fontWeight:700,color:"#6EE7B7",fontFamily:F}}>Concluídas ({totalDone})</span></div>{doneProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.doneTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{fontSize:11,color:"#CBD5E1",fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>
          {totalPending>0&&<div style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:8,height:8,borderRadius:"50%",background:"#F59E0B"}}/><span style={{fontSize:12,fontWeight:700,color:"#FCD34D",fontFamily:F}}>Pendentes — permanecem ({totalPending})</span></div>{pendingProjects.map((p,i)=>(<div key={i} style={{marginBottom:6,paddingLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{p.emoji}</span><span style={{fontSize:11,fontWeight:700,color:p.color,fontFamily:F}}>{p.name}</span></div>{p.pendingTasks.map((t,k)=>(<div key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 22px"}}><div style={{width:8,height:8,borderRadius:4,border:"1.5px solid #64748B",flexShrink:0}}/><span style={{fontSize:11,color:"#94A3B8",fontFamily:F}}>{t.text}</span></div>))}</div>))}</div>}
          <div style={{display:"flex",gap:10}}><button onClick={confirmComplete} style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#10B981,#3B82F6)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:F}}>Confirmar</button><button onClick={()=>setShowConfirm(false)} style={{padding:"12px 20px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#94A3B8",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:F}}>Cancelar</button></div>
        </div></div>)}

        {/* History */}
        {showHistory&&(<div style={{marginTop:20,display:"flex",flexDirection:"column",gap:10,animation:"fadeIn 0.3s ease"}}><h3 style={{fontSize:14,fontWeight:700,color:"#94A3B8",margin:0,fontFamily:F}}>Semanas concluídas</h3>{history.length===0&&<p style={{fontSize:13,color:"#475569",fontFamily:F}}>Nenhum registro ainda.</p>}{history.map((rec,i)=>(<HistoryCard key={i} record={rec} onDelete={()=>deleteHistoryEntry(i)}/>))}</div>)}

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:32,opacity:0.35}}>
          <p style={{fontSize:11,color:"#94A3B8",margin:0,fontWeight:500}}>Desenvolvido por Alexandre Sette</p>
          <p style={{fontSize:10,color:"#64748B",margin:"4px 0 0",fontStyle:"italic"}}>Colossenses 3:23-24</p>
        </div>
      </div>
    </div>
  );
}
