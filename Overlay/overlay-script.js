"use strict";
const P = new URLSearchParams(location.search);
const HOST   = P.get("host") || "127.0.0.1";
const PORT   = P.get("port") || "8080";
const PASS   = P.get("pass") || "";
const ACCENT = "#" + (P.get("accent") || "a855f7").replace(/^#/, "");
const THEME  = P.get("theme") === "light" ? "light" : "dark";
const IN_MS  = clampNum(P.get("in"), 200, 4000, 800);
const OUT_MS = clampNum(P.get("out"), 200, 4000, 600);
const HOLD_S = clampNum(P.get("hold"), 1, 600, 30);
const ARTIST = P.get("artist") !== "0";
const SIZE   = clampFloat(P.get("size"), 0.3, 3, 1);
const ALIGN  = ["left","center","right"].includes(P.get("align")) ? P.get("align") : "center";
const DEBUG  = P.get("debug") === "1";
function clampNum(v, lo, hi, d){ const n = parseInt(v,10); return isNaN(n) ? d : Math.min(hi, Math.max(lo, n)); }
function clampFloat(v, lo, hi, d){ const n = parseFloat(v); return isNaN(n) ? d : Math.min(hi, Math.max(lo, n)); }

document.documentElement.style.setProperty("--accent", ACCENT);
document.documentElement.dataset.theme = THEME;
document.body.dataset.debug = DEBUG ? "1" : "0";
const scaler = document.getElementById("scaler");
scaler.dataset.align = ALIGN;
const box = document.getElementById("box");
const primaryEl = document.getElementById("primary");
const secondaryEl = document.getElementById("secondary");
const EASE = "cubic-bezier(.22,.61,.36,1)";
function dbg(m){ if(DEBUG) document.getElementById("dbg").textContent = m; }

/* ---- scale the whole widget to the source size (Nutty-style) ----
   Height-driven against a fixed design reference so the font stays
   consistent between one- and two-line states; clamped to width. */
const DESIGN_H = 50;          // reference box height (px) at scale 1
const TARGET_FRAC = 0.55;     // box ≈ 55% of source height
function fit(){
  const tx = ALIGN === "center" ? "-50%" : "0";
  scaler.style.transform = "translate(" + tx + ", -50%) scale(1)";
  box.style.maxWidth = "none";
  const vw = window.innerWidth, vh = window.innerHeight;
  let scale = (vh * TARGET_FRAC * SIZE) / DESIGN_H;
  scale = Math.max(0.1, scale);
  // clamp so the scaled box fits the source width (leaves a small margin)
  const availW = vw * 0.94;
  box.style.maxWidth = (availW / scale) + "px";
  scaler.style.transform = "translate(" + tx + ", -50%) scale(" + scale + ")";
}
window.addEventListener("resize", fit);

/* ---- slide + fade up ---- */
let leaveTimer;
function enter(){
  box.style.transition = "none"; box.style.opacity = "0"; box.style.transform = "translateY(16px)";
  void box.offsetWidth;
  box.style.transition = "transform "+IN_MS+"ms "+EASE+", opacity "+IN_MS+"ms "+EASE;
  box.style.opacity = "1"; box.style.transform = "translateY(0)";
}
function leave(){
  box.style.transition = "transform "+OUT_MS+"ms "+EASE+", opacity "+OUT_MS+"ms "+EASE;
  box.style.opacity = "0"; box.style.transform = "translateY(-10px)";
}
function pop(){ enter(); clearTimeout(leaveTimer); leaveTimer = setTimeout(leave, IN_MS + HOLD_S*1000); }

function show(d){
  primaryEl.textContent = d.primary || d.label || "";
  const wantSec = d.state === "playing" && ARTIST && d.secondary;
  secondaryEl.textContent = wantSec ? d.secondary : "";
  secondaryEl.style.display = wantSec ? "" : "none";
  fit();               // text width changed → refit before showing
  pop();
  dbg("shown: " + (d.primary || d.label || "?"));
}

/* ---- Streamer.bot connection with reconnect backoff ---- */
let ws, backoff = 1000;
async function sha(str){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return btoa(String.fromCharCode(...new Uint8Array(b))); }
function send(o){ if(ws && ws.readyState===1){ o.id=o.id||("m"+Date.now()); ws.send(JSON.stringify(o)); } }
function connect(){
  dbg("connecting ws://"+HOST+":"+PORT+" …");
  try { ws = new WebSocket("ws://"+HOST+":"+PORT+"/"); } catch(e){ retry(); return; }
  ws.onopen = () => { if(!PASS) ready(); };
  ws.onclose = () => { dbg("disconnected — retrying"); retry(); };
  ws.onerror = () => dbg("connection error");
  ws.onmessage = async (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if(m.authentication && m.authentication.salt){ const s = await sha(PASS + m.authentication.salt); send({ request:"Authenticate", authentication: await sha(s + m.authentication.challenge) }); return; }
    if((m.request==="Hello" && !m.authentication) || (m.status==="ok" && backoff!==1000)){ ready(); return; }
    if(m.event && m.event.type==="Custom" && m.data && m.data.v && m.data.type!=="windows"){ show(m.data); }
  };
}
function ready(){ backoff = 1000; send({ request:"Subscribe", events:{ General:["Custom"] } }); dbg("connected — waiting for titles"); }
function retry(){ setTimeout(connect, backoff); backoff = Math.min(15000, backoff*2); }

fit();
connect();
if(DEBUG) setTimeout(() => show({ v:1, site:"youtube", label:"YouTube", state:"browsing", primary:"Debug — overlay is rendering", secondary:null, color:"#ff4d4d" }), 600);
