"use strict";

let REGISTRY = [
  { key:"youtube", label:"YouTube", glyph:"Y", mode:"full",  color:"#ff4d4d", suffix:" - YouTube" },
  { key:"spotify", label:"Spotify", glyph:"S", mode:"media", color:"#1ed760", suffix:" | Spotify" },
];
const ACCENT_PRESETS = ["#a855f7","#e879a6","#22d3ee","#f5b544","#4ade80","#fb7185"];
const OVERLAY_BASE = "https://widgets.themadcurve.cc/window-watcher/Overlay/window-watcher-overlay.html";
const GUIDE_URL = "https://themadcurve.notion.site/Window-Watcher-3b947d7b963780dcb2dbd20a4332dcca"; /* point at your Notion setup guide */

const SAMPLES = {
  youtube:{ site:"youtube", state:"browsing", primary:"This is a YouTube Pop-Up", secondary:"" },
  spotify:{ site:"spotify", state:"playing",  primary:"This is a Spotify Pop-Up", secondary:"Artist Here" },
};
const config = { theme:"dark", accent:"#A855F7", sites:{}, behavior:{ onScreenSeconds:20, align:"center", fadeInMs:800, fadeOutMs:600, showArtist:true } };
const conn = { host:"127.0.0.1", port:"8080", pass:"" };
REGISTRY.forEach(s => config.sites[s.key] = { enabled:true, accent:null });

const $ = s => document.querySelector(s);
const byKey = k => REGISTRY.find(s => s.key === k);
const RS = String.fromCharCode(0x1E), US = String.fromCharCode(0x1F);
const STORE = "ww_dock_v1";

function saveLocal(){ try{ localStorage.setItem(STORE, JSON.stringify({ config, registry:REGISTRY, conn })); }catch(e){} }
function loadLocal(){ try{ return JSON.parse(localStorage.getItem(STORE)); }catch(e){ return null; } }

let toastTimer;
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),1600); }

/* ===== status icon (custom SVGs with dot fallback) ===== */
function fallbackIcon(img){
  const color = img.dataset.state === "connected" ? "#3fd17a" : "#7a7093";
  img.onerror=null;
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="5" fill="'+color+'"/></svg>');
}
function setStatus(connected){
  const img=$("#statusIcon");
  img.dataset.state=connected?"connected":"disconnected";
  img.onerror=function(){ fallbackIcon(img); };
  img.src=connected?"./connected.svg":"./disconnected.svg";
  img.alt=img.title=connected?"Connected":"Disconnected";
  const img2=$("#statusIcon2"); if(img2){ img2.dataset.state=img.dataset.state; img2.onerror=function(){ fallbackIcon(img2); }; img2.src=img.src; }
  const ct=$("#connText"); if(ct) ct.textContent=connected?"Connected":"Disconnected";
  $("#offline").dataset.show=connected?"0":"1";
  $("#reshowBtn").disabled=!connected;
}

/* ===== Streamer.bot (auto-connect + reconnect) ===== */
const SB = {
  ws:null, connected:false, backoff:1000, wantOpen:false,
  async sha(str){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return btoa(String.fromCharCode(...new Uint8Array(b))); },
  open(){
    this.wantOpen=true;
    try{ this.ws=new WebSocket("ws://"+conn.host+":"+conn.port+"/"); }catch(e){ this.retry(); return; }
    this.ws.onopen=()=>{ if(!conn.pass) this.ready(); };
    this.ws.onclose=()=>{ this.connected=false; setStatus(false); if(this.wantOpen) this.retry(); };
    this.ws.onerror=()=>{};
    this.ws.onmessage=async(ev)=>{
      let m; try{ m=JSON.parse(ev.data); }catch{ return; }
      if(m.authentication && m.authentication.salt){ const secret=await this.sha(conn.pass+m.authentication.salt); this.send({ request:"Authenticate", authentication:await this.sha(secret+m.authentication.challenge) }); return; }
      if((m.request==="Hello" && !m.authentication) || (m.status==="ok" && !this.connected)){ this.ready(); return; }
      if(m.event && m.event.type==="Custom" && m.data && m.data.v){ applyLive(m.data); }
    };
  },
  ready(){ this.connected=true; this.backoff=1000; setStatus(true); this.send({ request:"Subscribe", events:{ General:["Custom"] } }); },
  retry(){ setTimeout(()=>{ if(this.wantOpen) this.open(); }, this.backoff); this.backoff=Math.min(15000,this.backoff*2); },
  close(){ this.wantOpen=false; if(this.ws){ try{ this.ws.close(); }catch(e){} } },
  reconnect(){ this.close(); this.backoff=1000; setTimeout(()=>this.open(),120); },
  send(o){ if(this.ws && this.ws.readyState===1){ o.id=o.id||("m"+Date.now()); this.ws.send(JSON.stringify(o)); } },
  doAction(name,args){ this.send({ request:"DoAction", action:{ name }, args:args||{} }); },
};

/* ===== persistence ===== */
let saveTimer;
function persist(){
  saveLocal(); writeRaw();
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ if(SB.connected){ SB.doAction("Save Window Watcher Config",{ registry:registryString(), config:JSON.stringify({ ...config, registry:REGISTRY }) }); const s=$("#saveState"); s.textContent="Saved"; setTimeout(()=>{ if(s.textContent==="Saved") s.textContent=""; },1200); } },500);
}
function registryString(){ return REGISTRY.filter(s=>config.sites[s.key]&&config.sites[s.key].enabled).map(s=>[s.key,s.label,s.suffix,s.mode,(config.sites[s.key].accent||s.color)].join(US)).join(RS); }
function writeRaw(){ $("#configOut").textContent=JSON.stringify({ ...config, registry:REGISTRY },null,2); }

function overlayUrl(){ const p=new URLSearchParams({ host:conn.host, port:conn.port, accent:config.accent.replace("#",""), theme:config.theme, align:config.behavior.align, in:config.behavior.fadeInMs, out:config.behavior.fadeOutMs, hold:config.behavior.onScreenSeconds, artist:config.behavior.showArtist?1:0 }); return OVERLAY_BASE+"?"+p.toString(); }
$("#overlayBtn").onclick=()=>navigator.clipboard.writeText(overlayUrl()).then(()=>toast("Overlay URL copied"));
$("#copyCfg").onclick=()=>navigator.clipboard.writeText(JSON.stringify({ ...config, registry:REGISTRY })).then(()=>toast("Config copied"));

/* ===== navigation ===== */
function navigate(view){
  document.querySelectorAll(".view").forEach(v=>v.hidden=(v.id!=="view-"+view));
  $("#menu").hidden=true; $("#menuBtn").setAttribute("aria-expanded","false");
  const host = (view==="appearance"||view==="behavior") ? $("#view-"+view+" .previewSlot") : null;
  const pb=$("#previewBlock");
  if(host){ host.appendChild(pb); renderPreview(lastSample); enter(); }
  else{ $("#previewHolder").appendChild(pb); }
  window.scrollTo(0,0);
}
$("#menuBtn").onclick=()=>{ const m=$("#menu"); m.hidden=!m.hidden; $("#menuBtn").setAttribute("aria-expanded", m.hidden?"false":"true"); };
document.querySelectorAll("#menu button").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>navigate("sites"));
$("#guideLink").href=GUIDE_URL;
$("#retryBtn").onclick=()=>{ SB.reconnect(); toast("Reconnecting…"); };
$("#retryBtn2").onclick=()=>{ SB.reconnect(); toast("Reconnecting…"); };

["sbHost","sbPort","sbPass"].forEach(id=>$("#"+id).addEventListener("change",()=>{ conn.host=$("#sbHost").value.trim()||"127.0.0.1"; conn.port=$("#sbPort").value.trim()||"8080"; conn.pass=$("#sbPass").value; saveLocal(); SB.reconnect(); }));

/* ===== theme / accent ===== */
function setTheme(t){ config.theme=t; document.documentElement.dataset.theme=t; $("#thDark").setAttribute("aria-pressed",t==="dark"); $("#thLight").setAttribute("aria-pressed",t==="light"); persist(); }
$("#thDark").onclick=()=>setTheme("dark"); $("#thLight").onclick=()=>setTheme("light");
function setAccent(hex){ hex=hex.toUpperCase(); config.accent=hex; document.documentElement.style.setProperty("--accent",hex); $("#hexInput").value=hex; $("#hexDot").style.background=hex; document.querySelectorAll(".swatch").forEach(el=>el.setAttribute("aria-pressed", el.dataset.hex.toUpperCase()===hex)); persist(); }
ACCENT_PRESETS.forEach(hex=>{ const b=document.createElement("button"); b.className="swatch"; b.dataset.hex=hex; b.style.background=hex; b.style.setProperty("--swatch",hex); b.setAttribute("aria-pressed","false"); b.onclick=()=>setAccent(hex); $("#swatches").appendChild(b); });
$("#hexInput").addEventListener("input",e=>{ let v=e.target.value.trim(); if(!v.startsWith("#")) v="#"+v; if(/^#[0-9a-fA-F]{6}$/.test(v)) setAccent(v); });

/* ===== sites ===== */
function renderSites(){
  const list=$("#siteList"); list.innerHTML="";
  REGISTRY.forEach(site=>{
    const c=config.sites[site.key];
    const row=document.createElement("div"); row.className="site"; row.dataset.on=c.enabled;
    row.innerHTML=`<div class="si" style="--sc:${c.accent||site.color}">${site.glyph}</div>
      <div><div class="nm">${site.label}</div><div class="dt">${site.mode}${site.suffix}</div></div>
      <input type="checkbox" class="toggle" ${c.enabled?"checked":""} aria-label="Watch ${site.label}">
      <button class="x" title="Remove ${site.label}">×</button>`;
    row.querySelector(".toggle").addEventListener("change",e=>{ c.enabled=e.target.checked; row.dataset.on=c.enabled; persist(); });
    row.querySelector(".x").addEventListener("click",()=>{ REGISTRY=REGISTRY.filter(s=>s.key!==site.key); delete config.sites[site.key]; renderSites(); persist(); });
    list.appendChild(row);
  });
}

$("#addBtn").onclick=()=>{
  const name=$("#asName").value.trim(), suffix=$("#asSuffix").value;
  if(!name){ toast("Give the site a name"); return; }
  if(!suffix.trim()){ toast("Pick a window, or type what the tab title ends with"); return; }
  const key=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||("site"+Date.now());
  if(byKey(key)) return;
  REGISTRY.push({ key, label:name, glyph:name[0].toUpperCase(), mode:$("#asMode").value, color:$("#asColor").value, suffix });
  config.sites[key]={ enabled:true, accent:null };
  SAMPLES[key]={ site:key, state:$("#asMode").value==="media"?"playing":"browsing", primary:name+" — example title", secondary:$("#asMode").value==="media"?"Artist name":"" };
  $("#asName").value=""; $("#asSuffix").value="";
  renderSites(); persist(); toast("Site added");
};

/* ===== behavior ===== */
$("#duration").addEventListener("input",e=>{ config.behavior.onScreenSeconds=+e.target.value; $("#durVal").textContent=e.target.value+"s"; persist(); });
$("#fadeIn").addEventListener("input",e=>{ config.behavior.fadeInMs=+e.target.value; $("#inVal").textContent=e.target.value+"ms"; persist(); });
$("#fadeOut").addEventListener("input",e=>{ config.behavior.fadeOutMs=+e.target.value; $("#outVal").textContent=e.target.value+"ms"; persist(); });
$("#showArtist").addEventListener("change",e=>{ config.behavior.showArtist=e.target.checked; renderPreview(lastSample); persist(); });
function setAlign(a){ config.behavior.align=a; ["Left","Center","Right"].forEach(x=>{ const el=$("#al"+x); if(el) el.setAttribute("aria-pressed", a===x.toLowerCase()); }); const b=$("#box"); if(b) b.dataset.align=a; enter(); persist(); }
["Left","Center","Right"].forEach(x=>{ const el=$("#al"+x); if(el) el.onclick=()=>setAlign(x.toLowerCase()); });

/* ===== preview ===== */
let lastSample=SAMPLES.youtube;
function renderPreview(s){
  if(!s) return; lastSample=s;
  const site=byKey(s.site);
  $("#bIcon").textContent = site ? site.glyph : (s.primary[0]||"•").toUpperCase();
  $("#bIcon").style.setProperty("--bc",(site && config.sites[site.key] && config.sites[site.key].accent) || (site && site.color) || "var(--accent)");
  $("#bPrimary").textContent = s.primary || (site?site.label:"");
  const show = s.state==="playing" && config.behavior.showArtist && s.secondary;
  $("#bSecondary").textContent = show ? s.secondary : "";
  $("#bSecondary").style.display = show ? "" : "none";
}
let leaveTimer;
function enter(){ const b=$("#box"); if(!b) return; clearTimeout(leaveTimer); const base=config.behavior.align==="center"?"translateX(-50%) ":""; b.style.transition="none"; b.style.opacity="0"; b.style.transform=base+"translateY(16px)"; void b.offsetWidth; const i=config.behavior.fadeInMs; b.style.transition=`transform ${i}ms var(--ease),opacity ${i}ms var(--ease)`; b.style.opacity="1"; b.style.transform=base+"translateY(0)"; }
function leave(){ const b=$("#box"); if(!b) return; const base=config.behavior.align==="center"?"translateX(-50%) ":""; const o=config.behavior.fadeOutMs; b.style.transition=`transform ${o}ms var(--ease),opacity ${o}ms var(--ease)`; b.style.opacity="0"; b.style.transform=base+"translateY(-10px)"; }
function pop(){ enter(); clearTimeout(leaveTimer); leaveTimer=setTimeout(leave, config.behavior.fadeInMs+config.behavior.onScreenSeconds*1000); }
$("#testBtn").onclick=pop; $("#exitBtn").onclick=leave;
$("#reshowBtn").onclick=()=>{ SB.doAction("Window Watcher Action",{ mode:"reshow" }); toast("Reshow sent"); };
function applyLive(d){ renderPreview({ site:d.site, state:d.state, primary:d.primary||d.label, secondary:d.secondary }); pop(); }

/* ===== restore + init ===== */
function applyAll(){
  document.documentElement.dataset.theme=config.theme;
  $("#thDark").setAttribute("aria-pressed",config.theme==="dark"); $("#thLight").setAttribute("aria-pressed",config.theme==="light");
  document.documentElement.style.setProperty("--accent",config.accent);
  $("#hexInput").value=config.accent; $("#hexDot").style.background=config.accent;
  document.querySelectorAll(".swatch").forEach(el=>el.setAttribute("aria-pressed", el.dataset.hex.toUpperCase()===config.accent.toUpperCase()));
  $("#duration").value=config.behavior.onScreenSeconds; $("#durVal").textContent=config.behavior.onScreenSeconds+"s";
  $("#fadeIn").value=config.behavior.fadeInMs; $("#inVal").textContent=config.behavior.fadeInMs+"ms";
  $("#fadeOut").value=config.behavior.fadeOutMs; $("#outVal").textContent=config.behavior.fadeOutMs+"ms";
  $("#showArtist").checked=config.behavior.showArtist;
  ["Left","Center","Right"].forEach(x=>{ const el=$("#al"+x); if(el) el.setAttribute("aria-pressed", config.behavior.align===x.toLowerCase()); });
  { const b=$("#box"); if(b) b.dataset.align=config.behavior.align; }
  $("#sbHost").value=conn.host; $("#sbPort").value=conn.port; $("#sbPass").value=conn.pass;
  renderSites(); renderPreview(SAMPLES.youtube); writeRaw();
}
(function init(){
  const saved=loadLocal();
  if(saved){
    if(saved.config){ Object.assign(config, saved.config); if(saved.config.behavior) Object.assign(config.behavior, saved.config.behavior); if(saved.config.sites) config.sites=saved.config.sites; }
    if(Array.isArray(saved.registry) && saved.registry.length) REGISTRY=saved.registry;
    if(saved.conn) Object.assign(conn, saved.conn);
    REGISTRY.forEach(s=>{ if(!config.sites[s.key]) config.sites[s.key]={ enabled:true, accent:null }; SAMPLES[s.key]=SAMPLES[s.key]||{ site:s.key, state:s.mode==="media"?"playing":"browsing", primary:s.label+" — example title", secondary:s.mode==="media"?"Artist name":"" }; });
  }
  applyAll();
  setStatus(false);
  navigate("sites");
  SB.open();
})();
