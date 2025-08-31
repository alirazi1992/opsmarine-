// /src/routes/fuel.js
import { h, jget, jpost, jpatch, panel, kpi } from "../main.js";

/* -------------------- helpers & math -------------------- */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isNum  = (v) => Number.isFinite(Number(v));
const toStr  = (x) => String(x ?? "");
const fmtL   = (n) => `${Number(n || 0).toLocaleString()} L`;

function litersOf(t){
  if (isNum(t.liters)) return Number(t.liters);
  if (isNum(t.percent) && isNum(t.capacity)) {
    return Math.round((Number(t.percent)/100) * Number(t.capacity));
  }
  return 0;
}
function percentOf(t){
  const cap = Number(t.capacity||0);
  if (cap > 0) return clamp(Math.round((litersOf(t)/cap)*100), 0, 100);
  return clamp(Number(t.percent||0), 0, 100);
}
async function patchTank(tankId, newLiters, capacity){
  const cap = Number(capacity||0);
  const liters = clamp(Math.round(Number(newLiters||0)), 0, cap>0 ? cap : Number(newLiters||0));
  const body = cap>0
    ? { liters, percent: clamp(Math.round((liters/cap)*100),0,100) }
    : { liters };
  return jpatch(`/fuel/${tankId}`, body);
}

/* rough great-circle distance (nm) */
function nmBetween(a, b){
  if (!a || !b || a.lat==null || a.lon==null || b.lat==null || b.lon==null) return 0;
  const Rkm=6371, toRad=(x)=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLon/2);
  const c=2*Math.asin(Math.sqrt(s1*s1 + Math.cos(lat1)*Math.cos(lat2)*s2*s2));
  return (Rkm*c)*0.539957;
}

/* -------------------- fuels -------------------- */
const FUEL_TYPES = ["Diesel","MGO","HFO","LNG","Biofuel","Jet A-1","MDO","LPG"];

/* -------------------- logs (instant fallback) -------------------- */
async function fetchLogsAny(tankId){
  try{
    const q = await jget(`/fuelLogs?tankId=${encodeURIComponent(tankId)}`);
    if (Array.isArray(q)) return q;
  }catch{}
  try{
    const d = await jget(`/fuelLogs/${encodeURIComponent(tankId)}`);
    if (Array.isArray(d)) return d;
  }catch{}
  try{
    const all = await jget(`/fuelLogs`);
    if (Array.isArray(all)) return all.filter(l=> toStr(l.tankId)===toStr(tankId));
  }catch{}
  return null;
}
function synthLogs(tankId){
  const now = Date.now();
  let level = 18000 - Math.random()*2500;
  const out=[];
  for(let i=11;i>=0;i--){
    const t = new Date(now - i*2*3600*1000).toISOString();
    const burn = Math.max(0,(Math.random()*500)-120);
    level = Math.max(0, level - burn);
    out.push({
      tankId, time:t, liters: Math.round(level),
      lat:  10 + Math.random()*40,
      lon: -50 + Math.random()*80,
      distance: 10 + Math.random()*20,
      location: Math.random()>0.5 ? "at sea":"near port"
    });
  }
  return out;
}

/* -------------------- small UI bits -------------------- */
function ringGauge(percent, liters){
  const pct = clamp(Math.round(Number(percent||0)),0,100);
  return h("div",{class:"flex items-center justify-center mb-3"},[
    h("div",{class:"fuel-gauge relative w-[110px] h-[110px]"},[
      h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
        h("path",{class:"fuel-gauge-circle fuel-gauge-bg", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":"100, 100"}),
        h("path",{class:"fuel-gauge-circle fuel-gauge-fill", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":`${pct}, 100`})
      ]),
      h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
        h("div",{class:"text-xl font-bold"}, `${pct}%`),
        h("div",{class:"text-xs text-slate-400"}, fmtL(liters))
      ])
    ])
  ]);
}

/* ==================== FIXED: Canvas trend chart ==================== */
function trendChart(logs = [], capacity) {
  try {
    if (!Array.isArray(logs) || logs.length < 2) {
      return h("div", { class: "text-xs text-slate-400" }, "Not enough history to chart.");
    }

    const cap = Number(capacity || 0);
    const pts = logs.map((l, i) => ({
      i,
      pct: cap > 0 ? clamp((Number(l.liters || 0) / cap) * 100, 0, 100) : 0
    })).filter(p => Number.isFinite(p.pct));

    if (pts.length < 2) {
      return h("div", { class: "text-xs text-slate-400" }, "Not enough history to chart.");
    }

    // Canvas size
    const w = 680, h = 160;
    const left = 30, right = 10, top = 8, bottom = 22;
    const innerW = w - left - right, innerH = h - top - bottom;

    // Hi-DPI crispness
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "rgba(15,23,42,.5)";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(148,163,184,.15)";
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(g => {
      const y = top + innerH * (1 - g / 100);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + innerW, y); ctx.stroke();
    });

    // Trend line
    ctx.strokeStyle = "rgba(34,211,238,.9)";
    ctx.lineWidth = 2;
    pts.forEach((p, i) => {
      const x = left + (innerW * i) / (pts.length - 1);
      const y = top + innerH * (1 - p.pct / 100);
      if (i === 0) { ctx.beginPath(); ctx.moveTo(x, y); }
      else { ctx.lineTo(x, y); }
    });
    ctx.stroke();

    // Last point dot
    const last = pts[pts.length - 1];
    const lx = left + innerW;
    const ly = top + innerH * (1 - last.pct / 100);
    ctx.fillStyle = "rgba(34,211,238,1)";
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();

    const wrap = h("div", { class: "rounded-md border border-slate-800/60 overflow-hidden" });
    wrap.appendChild(canvas);
    return wrap;
  } catch (e) {
    console.error("trendChart error:", e);
    return h("div", { class: "text-xs text-red-300" }, "Chart failed to render.");
  }
}

/* -------------------- modal framework (scrollable) -------------------- */
function ensureModalCSS(){
  if (document.getElementById("modal-scroll-style")) return;
  const st=document.createElement("style");
  st.id="modal-scroll-style";
  st.textContent=`
    .modal-scroll{max-height:70vh;overflow-y:auto}
    .modal-scroll::-webkit-scrollbar{width:8px}
    .modal-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:8px}
  `;
  document.head.appendChild(st);
}
function modalWrap(){ return h("div",{class:"fixed inset-0 z-50 flex items-center justify-center"}); }
function closeModal(w){ try{ document.body.removeChild(w); }catch{} }
function showPanel(wrap, title, nodes, actions){
  ensureModalCSS();
  const overlay = h("div",{class:"absolute inset-0 bg-black/60", onClick:()=>closeModal(wrap)});
  const panelEl = h("div",{class:"relative z-10 w-full max-w-6xl glass-panel rounded-2xl border border-slate-800/50 shadow-xl overflow-hidden"});
  const header = h("div",{class:"sticky top-0 z-10 backdrop-blur-lg bg-slate-900/70 border-b border-slate-800/50 p-4 flex items-center justify-between"},[
    h("h3",{class:"text-lg font-semibold"}, title),
    h("button",{class:"text-slate-400 hover:text-white", onClick:()=>closeModal(wrap)}, h("i",{class:"fas fa-times"}))
  ]);
  const body = h("div",{class:"p-4 modal-scroll"}, nodes);
  const footer = h("div",{class:"sticky bottom-0 z-10 backdrop-blur-lg bg-slate-900/70 border-t border-slate-800/50 p-3 flex justify-end gap-2"}, actions);
  panelEl.appendChild(header); panelEl.appendChild(body); panelEl.appendChild(footer);
  wrap.appendChild(overlay); wrap.appendChild(panelEl); document.body.appendChild(wrap);
  return { body };
}

/* -------------------- DETAILS (instant render, then hydrate) -------------------- */
function openTankDetailsInstant(tank){
  const wrap = modalWrap();

  const cap = Number(tank.capacity||0);
  const curL = litersOf(tank);
  const curP = percentOf(tank);

  const infoBox = h("div");
  const chartBox = h("div",{class:"mt-3"},[
    h("div",{class:"text-sm font-medium mb-2"},"Fuel usage trend"),
    h("div",{class:"text-xs text-slate-400"},"Loading…")
  ]);
  const mapBox = h("div",{class:"mt-3"},[
    h("div",{class:"text-sm font-medium mb-2"},"Recent track"),
    h("div",{id:`detail-map-${tank.id}`, class:"h-64 rounded-xl overflow-hidden border border-slate-800/60"})
  ]);
  const tableBox = h("div",{class:"mt-4"},[
    h("div",{class:"text-sm font-medium mb-2"},"Recent logs"),
    h("div",{class:"text-xs text-slate-400"},"Loading…")
  ]);

  const distInput = h("input",{type:"number", step:"1", placeholder:"Planned distance (nm)", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const projOut   = h("div",{class:"text-sm text-slate-300 mt-1"},"Not enough data to project yet.");

  const { body } = showPanel(
    wrap,
    `Tank Details — ${tank.name || "Tank"}`,
    [
      h("div",{class:"grid md:grid-cols-[130px_1fr] gap-4 items-start"},[
        ringGauge(curP, curL),
        infoBox
      ]),
      h("div",{class:"mt-3"},[
        h("div",{class:"text-sm font-medium mb-1"},"Plan fuel for distance"),
        distInput, projOut
      ]),
      chartBox, mapBox, tableBox
    ],
    [ h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Close") ]
  );

  /* static info block */
  infoBox.replaceChildren(
    h("div",{class:"grid md:grid-cols-3 gap-3"},[
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Tank"),
        h("div",{class:"font-semibold"}, tank.name||"Tank"),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Vessel"),
        h("div",{}, tank.vessel||"—"),
      ]),
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Fuel Type"),
        h("div",{class:"font-semibold"}, tank.type||"—"),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Capacity"),
        h("div",{}, cap?fmtL(cap):"—"),
      ]),
      h("div",{class:"bg-slate-800/40 rounded p-3"},[
        h("div",{class:"text-xs text-slate-400"},"Current Level"),
        h("div",{class:"font-semibold"}, `${fmtL(curL)} (${curP}%)`),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Consumption"),
        h("div",{},"—")
      ])
    ])
  );

  /* renderer (safe; no silent failures) */
  const renderWithLogs = (logs, tag="demo")=>{
    try{
      const sorted = (logs||[]).slice().sort((a,b)=> new Date(a.time)-new Date(b.time));
      if (!sorted.length){
        chartBox.replaceChildren(
          h("div",{class:"text-sm font-medium mb-2"},"Fuel usage trend"),
          h("div",{class:"text-xs text-slate-400"},"No data.")
        );
        tableBox.replaceChildren(h("div",{class:"text-sm font-medium mb-2"},"Recent logs"), h("div",{class:"text-xs text-slate-400"},"No data."));
        return;
      }

      /* consumption calc */
      let used=0, totalNm=0;
      for (let i=1;i<sorted.length;i++){
        const prev = Number(sorted[i-1].liters||0);
        const cur  = Number(sorted[i].liters||0);
        const d = prev-cur; if (d>0) used+=d;
        totalNm += sorted[i].distance!=null ? Number(sorted[i].distance||0) : nmBetween(sorted[i-1], sorted[i]);
      }
      const perNm = totalNm>0 ? used/totalNm : 0;

      /* update consumption cell */
      const block = infoBox.querySelectorAll(".bg-slate-800\\/40")[2];
      if (block) block.replaceChildren(
        h("div",{class:"text-xs text-slate-400"},"Current Level"),
        h("div",{class:"font-semibold"}, `${fmtL(litersOf(tank))} (${percentOf(tank)}%)`),
        h("div",{class:"text-xs text-slate-400 mt-2"},"Consumption"),
        h("div",{}, totalNm>0 ? `${perNm.toFixed(1)} L / nm` : "—")
      );

      /* projection */
      const doProj = ()=>{
        const nm = Number(distInput.value||0);
        if (!nm || nm<=0 || !perNm){
          projOut.textContent = perNm ? "Enter a positive distance." : "Not enough data to project usage.";
          return;
        }
        const need = Math.round(perNm*nm);
        const delta = need - litersOf(tank);
        projOut.innerHTML = `Estimated need: <b>${fmtL(need)}</b> — You ${delta>0?`need <span class="text-red-300">${fmtL(delta)}</span> more`:`have <span class="text-green-300">${fmtL(-delta)}</span> spare`}.`;
      };
      distInput.oninput = doProj;

      /* chart */
      chartBox.replaceChildren(
        h("div",{class:"text-sm font-medium mb-2"},`Fuel usage trend ${tag==="real"?"":"(demo)"}`),
        trendChart(sorted, cap)
      );

      /* table */
      tableBox.replaceChildren(
        h("div",{class:"text-sm font-medium mb-2"},"Recent logs"),
        h("table",{class:"min-w-full text-sm"},[
          h("thead",{class:"border-b border-slate-800/60"}, h("tr",{},[
            h("th",{class:"text-left py-2 pr-3"},"Time"),
            h("th",{class:"text-left py-2 pr-3"},"Location"),
            h("th",{class:"text-left py-2 pr-3"},"Liters"),
            h("th",{class:"text-left py-2 pr-3"},"Δ (L)"),
            h("th",{class:"text-left py-2 pr-3"},"Distance (nm)"),
          ])),
          h("tbody",{}, sorted.slice(-20).map((l,i,arr)=>{
            const prev = i>0 ? Number(arr[i-1].liters||0) : Number(l.liters||0);
            const d = prev - Number(l.liters||0);
            return h("tr",{class:"border-b border-slate-800/40"},[
              h("td",{class:"py-2 pr-3"}, new Date(l.time).toLocaleString()),
              h("td",{class:"py-2 pr-3"}, l.location || `${l.lat??"?"}, ${l.lon??"?"}`),
              h("td",{class:"py-2 pr-3"}, fmtL(l.liters)),
              h("td",{class:"py-2 pr-3"}, d===0?"—":(d>0?`-${fmtL(d)}`:`+${fmtL(-d)}`)),
              h("td",{class:"py-2 pr-3"}, (l.distance!=null)? Number(l.distance).toFixed(1) : "—"),
            ]);
          }))
        ])
      );

      /* mini-map */
      setTimeout(()=>{
        if (!window.L) return;
        const el = document.getElementById(`detail-map-${tank.id}`);
        if (!el) return;
        el.innerHTML = "";
        const map = L.map(el, { zoomControl:true, preferCanvas:true }).setView([20,0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
          detectRetina:true
        }).addTo(map);
        const pts = sorted.filter(p=> p.lat!=null && p.lon!=null).map(p=> [Number(p.lat), Number(p.lon)]);
        if (pts.length){
          const line = L.polyline(pts, { weight:3, opacity:0.9 }).addTo(map);
          L.marker(pts[0]).addTo(map).bindTooltip("Start");
          L.marker(pts[pts.length-1]).addTo(map).bindTooltip("Latest");
          map.fitBounds(line.getBounds(), { padding:[20,20] });
        }
        setTimeout(()=> map.invalidateSize(), 80);
      }, 0);

    }catch(err){
      chartBox.replaceChildren(h("div",{class:"text-xs text-red-300"},"Failed to render details."));
      tableBox.replaceChildren(h("div",{class:"text-xs text-red-300"},"Failed to load logs."));
      console.error("Details render error:", err);
    }
  };

  /* render immediately with demo logs, then hydrate with real if available */
  renderWithLogs(synthLogs(tank.id), "demo");
  (async ()=>{
    try{
      const real = await fetchLogsAny(tank.id);
      if (Array.isArray(real) && real.length) renderWithLogs(real, "real");
    }catch{}
  })();
}

/* -------------------- refuel & transfer modals -------------------- */
function openRefuelModal({ tank, onDone }){
  const wrap = modalWrap();
  const litersInput = h("input",{type:"number", step:"1", placeholder:"Liters (+ add, - remove)", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const apply = async ()=>{
    const delta = Number(litersInput.value||0);
    if (!delta) return;
    await patchTank(tank.id, litersOf(tank)+delta, tank.capacity);
    onDone?.(); closeModal(wrap);
  };
  showPanel(wrap, "Log Refuel / Adjustment", [
    h("div",{class:"text-sm text-slate-400 mb-2"}, `Target: ${tank.name||"Tank"} — ${tank.vessel||"—"}`),
    h("div",{},[h("label",{class:"text-sm text-slate-300"},"Liters"), litersInput]),
  ],[
    h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Cancel"),
    h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500", onClick:apply},"Apply")
  ]);
}

function openTransferModal({ tanks, preSourceId=null, onDone }){
  const wrap = modalWrap();
  const tankOpt = (t)=> h("option",{value:t.id}, `${t.name||"Tank"} — ${t.vessel||"—"} (${t.type||"—"})`);

  const srcSel = h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"}, tanks.map(tankOpt));
  const dstSel = h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});
  const typeSel= h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700"}, FUEL_TYPES.map(ft=>h("option",{value:ft}, ft)));
  const liters = h("input",{type:"number", step:"1", placeholder:"Liters to transfer", class:"w-full p-2 rounded bg-slate-800 border border-slate-700"});

  if (preSourceId) srcSel.value = toStr(preSourceId);

  const syncTypeFromSrc = ()=>{
    const s = tanks.find(t=> toStr(t.id)===toStr(srcSel.value));
    if (s?.type) typeSel.value = s.type;
  };
  const rebuildDst = ()=>{
    const need = typeSel.value, srcId = toStr(srcSel.value);
    dstSel.innerHTML = "";
    const dests = tanks.filter(t=> (t.type||"Diesel")===need && toStr(t.id)!==srcId);
    dests.forEach(t=> dstSel.appendChild(tankOpt(t)));
  };

  syncTypeFromSrc(); rebuildDst();
  srcSel.addEventListener("change", ()=>{ syncTypeFromSrc(); rebuildDst(); });
  typeSel.addEventListener("change", rebuildDst);

  const doTransfer = async ()=>{
    const src = tanks.find(t=> toStr(t.id)===toStr(srcSel.value));
    const dst = tanks.find(t=> toStr(t.id)===toStr(dstSel.value));
    const amt = Number(liters.value||0);
    const need = typeSel.value;

    if (!src || !dst){ alert("Selected tanks not found."); return; }
    if (src.id===dst.id){ alert("Source and destination must differ."); return; }
    if (!amt || amt<=0){ alert("Enter a positive liters amount."); return; }
    if ((src.type||"Diesel")!==need || (dst.type||"Diesel")!==need){
      alert("Tank types must match the selected fuel type."); return;
    }

    const srcL = litersOf(src), dstL = litersOf(dst), dstCap = Number(dst.capacity||0);
    if (srcL < amt){ alert("Source doesn't have enough fuel."); return; }
    const maxAccept = dstCap>0 ? Math.max(0, dstCap - dstL) : amt;
    const actual = Math.min(amt, maxAccept);
    if (actual<=0){ alert("Destination is already at capacity."); return; }

    await Promise.all([
      patchTank(src.id, srcL - actual, src.capacity),
      patchTank(dst.id, dstL + actual, dst.capacity),
      jpost("/fuelTransfers", { time:new Date().toISOString(), fromId:src.id, toId:dst.id, liters:actual, fuelType:need }).catch(()=>{})
    ]);
    onDone?.({actual}); closeModal(wrap);
  };

  showPanel(wrap, "Transfer Fuel", [
    h("div",{class:"grid md:grid-cols-2 gap-3"},[
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Source tank"), srcSel]),
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Destination tank"), dstSel]),
    ]),
    h("div",{class:"grid md:grid-cols-2 gap-3 mt-3"},[
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Fuel Type"), typeSel]),
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Liters"), liters]),
    ]),
    h("div",{class:"text-xs text-slate-400 mt-2"},"Capacity limits are enforced automatically.")
  ],[
    h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60", onClick:()=>closeModal(wrap)},"Cancel"),
    h("button",{class:"px-3 py-2 rounded bg-purple-600 hover:bg-purple-500", onClick:doTransfer},"Transfer")
  ]);
}

/* -------------------- page: Fuel Monitoring -------------------- */
export async function routeFuel(){
  let tanks = await jget("/fuel");
  const filters = { vessel:"ALL", type:"ALL", criticalOnly:false, search:"" };

  const header = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Tanks", ()=> filtered().length),
    kpi("Avg Fill",   ()=> `${avgPct(filtered())}%`),
    kpi("Critical (<20%)", ()=> filtered().filter(t=> percentOf(t)<20).length),
    kpi("Types", ()=> new Set(tanks.map(t=> t.type||"—")).size),
  ]);

  const toolbar = buildToolbar();
  const cards = h("div",{class:"grid md:grid-cols-3 gap-4"});

  let stopAuto = autoRefresh(async ()=>{ try{ tanks = await jget("/fuel"); rerender(true);}catch{} }, 10000);
  const root = panel("Fuel Monitoring", h("div",{},[header, toolbar, cards]));

  function filtered(){
    let out = tanks.slice();
    if (filters.vessel!=="ALL") out = out.filter(t=> (t.vessel||"—")===filters.vessel);
    if (filters.type  !=="ALL") out = out.filter(t=> (t.type  ||"—")===filters.type);
    if (filters.criticalOnly)   out = out.filter(t=> percentOf(t)<20);
    if (filters.search.trim()){
      const q = filters.search.toLowerCase();
      out = out.filter(t=>
        String(t.name||"").toLowerCase().includes(q) ||
        String(t.vessel||"").toLowerCase().includes(q) ||
        String(t.type||"").toLowerCase().includes(q)
      );
    }
    return out;
  }
  function renderKPIs(){
    header.innerHTML="";
    header.appendChild(kpi("Total Tanks", filtered().length));
    header.appendChild(kpi("Avg Fill", `${avgPct(filtered())}%`));
    header.appendChild(kpi("Critical (<20%)", filtered().filter(t=> percentOf(t)<20).length));
    header.appendChild(kpi("Types", new Set(tanks.map(t=> t.type||"—")).size));
  }
  function rerender(fromAuto=false){
    rebuildToolbarOptions(toolbar, tanks, filters);
    renderKPIs();

    cards.innerHTML="";
    const list = filtered();
    if (!list.length){
      cards.appendChild(h("div",{class:"text-slate-400 text-sm col-span-full py-8 text-center"},"No tanks match your filters."));
    } else {
      list.forEach(t=> cards.appendChild(tankCard(t)));
    }

    if (!fromAuto){
      stopAuto();
      stopAuto = autoRefresh(async ()=>{ try{ tanks = await jget("/fuel"); rerender(true);}catch{} }, 10000);
    }
  }

  function tankCard(t){
    const cap = Number(t.capacity||0);
    const liters = litersOf(t);
    const pct = percentOf(t);
    const statusClass = pct<20 ? "bg-yellow-900/30 text-yellow-400"
                      : pct<50 ? "bg-blue-900/30 text-blue-400"
                               : "bg-green-900/30 text-green-400";

    const card = h("div",{class:"bg-slate-800/30 rounded-xl p-4 border border-slate-800/50 cursor-pointer hover:border-cyan-500/30 transition"},[
      h("div",{class:"flex items-center justify-between mb-2"},[
        h("div",{class:"font-medium flex items-center gap-2"},[
          h("span",{}, t.name||"Tank"),
          cap ? h("span",{class:"text-xs text-slate-500"},"• Cap "+fmtL(cap)) : ""
        ]),
        h("div",{class:`text-xs ${statusClass} px-2 py-0.5 rounded-full`}, pct<20?"Low":"Normal")
      ]),
      h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel||"—"} • ${t.type||"—"}`),
      ringGauge(pct, liters),
      h("div",{class:"flex items-center justify-between text-xs mt-1"},[
        h("span",{class:"text-slate-400"}, cap?`Cap: ${fmtL(cap)}`:""),
        h("span",{class:"text-slate-400"}, `${fmtL(liters)} now`)
      ]),
      h("div",{class:"mt-3 flex flex-wrap gap-2"},[
        quickBtn("-5%", -5),
        quickBtn("+5%", +10>5?+5:+5),
        quickBtn("+10%", +10),
        actionBtn("Log refuel","bg-blue-600 hover:bg-blue-500", ()=> openRefuelModal({ tank:t, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} })),
        actionBtn("Transfer","bg-purple-600 hover:bg-purple-500", ()=> openTransferModal({ tanks, preSourceId:t.id, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} })),
        actionBtn("Details","bg-slate-700 hover:bg-slate-600", ()=> openTankDetailsInstant(t))
      ])
    ]);
    card.addEventListener("click",(e)=>{ if (e.target.closest("button")) return; openTankDetailsInstant(t); });

    function quickBtn(label, delta){
      return h("button",{
        class:"px-2 py-1 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-xs",
        onClick: async (ev)=>{
          ev.stopPropagation();
          const cap = Number(t.capacity||0);
          const curL = litersOf(t);
          const nextPct = clamp(percentOf(t)+delta, 0, 100);
          const nextL  = cap>0 ? Math.round((nextPct/100)*cap) : curL + Math.round((delta/100)*curL);
          await patchTank(t.id, nextL, cap);
          const fresh = await jget("/fuel");
          Object.assign(t, fresh.find(x=> toStr(x.id)===toStr(t.id)) || t);
          rerender(true);
        }
      }, label);
    }
    function actionBtn(text, cls, onClick){
      return h("button",{class:`px-2 py-1 rounded ${cls} text-xs`, onClick:(ev)=>{ ev.stopPropagation(); onClick(); }}, text);
    }
    return card;
  }

  function buildToolbar(){
    const vesselSel = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const typeSel   = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"});
    const crit = h("input",{type:"checkbox", class:"accent-cyan-500"});
    const search = h("input",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm", placeholder:"Search tank / vessel / type"});
    vesselSel.addEventListener("change", e=>{ filters.vessel=e.target.value; rerender(); });
    typeSel  .addEventListener("change", e=>{ filters.type  =e.target.value; rerender(); });
    crit     .addEventListener("change", e=>{ filters.criticalOnly=e.target.checked; rerender(); });
    search   .addEventListener("input",  e=>{ filters.search=e.target.value; rerender(); });

    const refreshBtn = h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-sm", onClick: async ()=>{ tanks = await jget("/fuel"); rerender(true);} }, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]);
    const newRefuel  = h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm", onClick: ()=>{
      const first = filtered()[0] || tanks[0]; if (!first) return;
      openRefuelModal({ tank:first, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} });
    }}, [h("i",{class:"fas fa-plus mr-2"}),"Log Refuel"]);
    const newTrans   = h("button",{class:"px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-sm", onClick: ()=> openTransferModal({ tanks, onDone: async ()=>{ tanks = await jget("/fuel"); rerender(true);} })}, [h("i",{class:"fas fa-exchange-alt mr-2"}),"Transfer"]);

    const node = h("div",{class:"mb-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between"},[
      h("div",{class:"flex flex-wrap gap-2"},[
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Vessel"), vesselSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Fuel Type"), typeSel]),
        h("label",{class:"text-sm flex items-center gap-2"},[crit, h("span",{class:"text-slate-400"},"Critical <20%")]),
      ]),
      h("div",{class:"flex flex-wrap gap-2"},[ search, refreshBtn, newRefuel, newTrans ])
    ]);
    node._vesselSel=vesselSel; node._typeSel=typeSel;
    return node;
  }

  function rebuildToolbarOptions(toolbarNode, data, filters){
    const vesselSel = toolbarNode._vesselSel;
    const typeSel   = toolbarNode._typeSel;
    if (!vesselSel || !typeSel) return;

    const vOpts = ["ALL", ...Array.from(new Set(data.map(t=> t.vessel || "—")))];
    vesselSel.innerHTML=""; vOpts.forEach(o=> vesselSel.appendChild(h("option",{value:o}, o)));
    vesselSel.value = vOpts.includes(filters.vessel) ? filters.vessel : "ALL";

    const tOpts = ["ALL", ...new Set([...FUEL_TYPES, ...data.map(t=> t.type || "Diesel")])];
    typeSel.innerHTML=""; tOpts.forEach(o=> typeSel.appendChild(h("option",{value:o}, o)));
    typeSel.value = tOpts.includes(filters.type) ? filters.type : "ALL";
  }

  rerender();
  return root;
}

/* -------------------- misc -------------------- */
function autoRefresh(fn, ms){ const id=setInterval(fn,ms); return ()=>clearInterval(id); }
function avgPct(arr){ if (!arr.length) return 0; const s=arr.reduce((a,t)=> a + percentOf(t), 0); return Math.round(s/arr.length); }
