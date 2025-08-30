// ---------------------------------------------------------
// Config + tiny API
// ---------------------------------------------------------
const API_BASE = (import.meta?.env?.VITE_API_BASE) || "http://localhost:7001";

export const API = {
  get base() { return localStorage.getItem("apiBase") || API_BASE; },
  set base(v) { localStorage.setItem("apiBase", v); }
};

function api(path, opts = {}) {
  return fetch(`${API.base}${path}`, {
    headers: { "Content-Type":"application/json" },
    ...opts
  });
}
export async function jget(p){ const r=await api(p); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jpost(p,b){ const r=await api(p,{method:"POST",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jpatch(p,b){ const r=await api(p,{method:"PATCH",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
export async function jdel(p){ const r=await api(p,{method:"DELETE"}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }

// ---------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      el.setAttribute(k, v);
    }
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    if (c === false || c === true) return; // ignore booleans to avoid "true/false" text
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  });
  return el;
}
const qs  = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> Array.from(r.querySelectorAll(s));

export function panel(title, content){
  return h("div",{class:"glass-panel rounded-2xl p-4 border border-slate-800/50"},[
    h("h2",{class:"text-lg font-semibold mb-3"}, title), content
  ]);
}
export function kpi(label, val){
  const value = (typeof val === "function" ? val() : val);
  return h("div",{class:"rounded-xl bg-slate-800/60 p-4"},[
    h("div",{class:"text-slate-300 text-sm"}, label),
    h("div",{class:"text-2xl font-bold"}, value == null ? "0" : String(value))
  ]);
}
export function table(items, columns){
  const thead = h("thead",{class:"border-b border-slate-800/60"},
    h("tr",{}, columns.map(c=>h("th",{class:"py-2 pr-4 font-semibold text-left"}, c.label)))
  );
  const tbody = h("tbody");
  (items||[]).forEach(row=>{
    const tr = h("tr",{class:"border-b border-slate-800/40 hover:bg-slate-800/30"});
    columns.forEach(c=>{
      const raw = typeof c.value === "function" ? c.value(row) : row[c.key || c.value];
      const td = h("td",{class:"py-2 pr-4"});
      if (raw instanceof Node) td.appendChild(raw);
      else if (raw == null) td.textContent = "";
      else td.textContent = typeof raw === "string" ? raw : String(raw);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  return h("table",{class:"min-w-full text-sm"},[thead,tbody]);
}

// ---------------------------------------------------------
// Modal utility (reusable)
// ---------------------------------------------------------
function closeOnEsc(e){ if(e.key==="Escape"){ destroyModal(); } }
export function showModal(title, contentNode){
  destroyModal();
  const root = qs("#modal-root");
  const overlay = h("div",{class:"fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4", id:"_modal_overlay", onClick:(e)=>{ if(e.target.id==="_modal_overlay") destroyModal(); }});
  const box = h("div",{class:"glass-panel w-full max-w-6xl rounded-2xl border border-slate-800/60 shadow-xl"},[
    h("div",{class:"flex items-center justify-between p-4 border-b border-slate-800/60"},[
      h("h3",{class:"text-lg font-semibold"}, title),
      h("button",{class:"text-slate-400 hover:text-white", onClick:destroyModal}, h("i",{class:"fas fa-times"}))
    ]),
    h("div",{class:"p-4 overflow-auto max-h-[75vh]"}, contentNode)
  ]);
  overlay.appendChild(box);
  root.appendChild(overlay);
  document.addEventListener("keydown", closeOnEsc);
}
export function destroyModal(){
  const root = qs("#modal-root");
  if (root) root.innerHTML = "";
  document.removeEventListener("keydown", closeOnEsc);
}

// ---------------------------------------------------------
// Router (imports)
// ---------------------------------------------------------
import { routeVessels }   from "./routes/vessels.js";
import { routeTickets }   from "./routes/tickets.js";
import { routeNewTicket } from "./routes/newtickets.js";
import { routeFuel }      from "./routes/fuel.js";
import { routeAlerts }    from "./routes/alerts.js";
import { routeReports }   from "./routes/reports.js";
import { routeSettings }  from "./routes/settings.js";

const routes = {
  "/dashboard": renderDashboard,
  "/vessels":   routeVessels,
  "/tickets":   routeTickets,
  "/new-ticket":routeNewTicket,
  "/fuel":      routeFuel,
  "/alerts":    routeAlerts,
  "/reports":   routeReports,
  "/settings":  routeSettings,
};

function setActiveNav(hash){
  qsa(".navlink").forEach(a=>a.classList.remove("nav-active"));
  const active = document.querySelector(`a[href="${hash}"]`);
  if (active) active.classList.add("nav-active");
}

async function router(){
  const hash = location.hash || "#/dashboard";
  setActiveNav(hash);
  const key = hash.replace(/^#/, "");
  const handler = routes[key];
  const view = qs("#view"); view.innerHTML = "";
  try {
    const node = handler ? await handler() : h("div",{}, "Not found");
    view.appendChild(node);
  } catch(err){
    view.appendChild(h("pre",{class:"text-red-400 whitespace-pre-wrap"}, String(err?.message || err)));
  }
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", ()=>{ if(!location.hash) location.hash="#/dashboard"; router(); });

// ---------------------------------------------------------
// Dashboard
// ---------------------------------------------------------
async function renderDashboard(){
  const tpl = qs("#tmpl-dashboard")?.content?.cloneNode(true) || h("div",{},[]);
  const root = h("div",{},[tpl]);

  // Load data
  const [vesselsRes, ticketsRes, alertsRes, fuelRes] = await Promise.allSettled([
    jget("/vessels"), jget("/tickets"), jget("/alerts"), jget("/fuel")
  ]);
  const ok = s => s.status==="fulfilled" ? s.value : [];

  const V = ok(vesselsRes), T = ok(ticketsRes), A = ok(alertsRes), F = ok(fuelRes);
  const totFuelLiters = (F||[]).reduce((a,b)=> {
    const pct = (typeof b.percent === "number")
      ? Math.max(0, Math.min(100, b.percent))
      : (b.capacity ? Math.round(((b.liters??0)/b.capacity)*100) : 0);
    const liters = b.capacity ? Math.round((Number(b.capacity)*pct)/100) : (b.liters ?? 0);
    return a + (Number.isFinite(liters) ? liters : 0);
  }, 0);

  // KPIs
  root.querySelector("#kpi-active-vessels")?.replaceChildren(document.createTextNode(String((V||[]).length||0)));
  root.querySelector("#kpi-open-tickets") ?.replaceChildren(document.createTextNode(String((T||[]).filter(t=> (t.status||"").toLowerCase() !== "closed").length||0)));
  root.querySelector("#kpi-total-fuel")   ?.replaceChildren(document.createTextNode((totFuelLiters||0).toLocaleString()));
  root.querySelector("#kpi-alerts")       ?.replaceChildren(document.createTextNode(String((A||[]).length||0)));
  const badge = document.getElementById("alerts-count");
  if (badge) badge.textContent = String((A||[]).length||0);

  // Recent tickets
  const recentWrap = root.querySelector("#recent-tickets");
  if (recentWrap && (T||[]).length){
    recentWrap.innerHTML = "";
    (T||[]).slice(-3).reverse().forEach(t=>{
      recentWrap.appendChild(
        h("div",{class:"p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition"},[
          h("div",{class:"flex items-start justify-between"},[
            h("div",{},[
              h("div",{class:"font-medium"}, t.title || "Ticket"),
              h("div",{class:"text-xs text-slate-400 mt-1"}, `Vessel #${t.vesselId ?? "—"}`)
            ]),
            h("span",{class:`text-xs ${
              ({"Low":"bg-blue-900/50 text-blue-300","Medium":"bg-yellow-900/50 text-yellow-300","High":"bg-red-900/50 text-red-300"})[t.priority] || "bg-slate-700/50 text-slate-200"
            } px-2 py-0.5 rounded-full`}, t.priority || "—")
          ]),
          h("div",{class:"mt-2 text-xs text-slate-500"}, t.status||"")
        ])
      );
    });
  }

  // Fuel preview
  const fuelPrev = root.querySelector("#fuel-preview");
  if (fuelPrev && (F||[]).length){
    fuelPrev.innerHTML = "";
    (F||[]).slice(0,4).forEach(t=>{
      const pct = Math.max(0, Math.min(100, typeof t.percent==="number" ? t.percent : (t.capacity ? Math.round(((t.liters??0)/t.capacity)*100) : 0)));
      const liters = t.capacity ? Math.round((pct/100)*Number(t.capacity)) : (t.liters ?? 0);
      const statusClass = pct<20 ? 'bg-yellow-900/30 text-yellow-400'
                        : pct<50 ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-green-900/30 text-green-400';
      fuelPrev.appendChild(
        h("div",{class:"bg-slate-800/30 rounded-xl p-4 hover:border-cyan-500/30 transition border border-slate-800/50"},[
          h("div",{class:"flex items-center justify-between mb-2"},[
            h("div",{class:"font-medium"}, t.name || "Tank"),
            h("div",{class:`text-xs ${statusClass} px-2 py-0.5 rounded-full`}, pct<20 ? "Low" : "Normal")
          ]),
          h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel||"—"} • ${t.type||"—"}`),
          // small gauge
          h("div",{class:"flex items-center justify-center mb-3"},[
            h("div",{class:"fuel-gauge"},[
              h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
                h("path",{"class":"fuel-gauge-circle fuel-gauge-bg",
                  d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
                  "stroke-dasharray":"100, 100"
                }),
                h("path",{"class":"fuel-gauge-circle fuel-gauge-fill",
                  d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831",
                  "stroke-dasharray":`${pct}, 100`
                }),
              ]),
              h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
                h("div",{class:"text-xl font-bold"}, `${pct}%`),
                h("div",{class:"text-xs text-slate-400"}, `${(liters||0).toLocaleString()}L`)
              ])
            ])
          ]),
          h("div",{class:"flex items-center justify-between text-xs"},[
            h("span",{class:"text-slate-400"}, t.capacity ? `Capacity: ${Number(t.capacity).toLocaleString()}L` : ""),
            h("a",{href:"#/fuel", class:"text-cyan-400 hover:text-cyan-300"}, h("i",{class:"fas fa-ellipsis-h"}))
          ])
        ])
      );
    });
  }

  // Map + filter
  const mapEl = root.querySelector("#leaflet-map-dashboard");
  if (mapEl && window.L) {
    const controller = initVesselMap(mapEl, { vessels: V, autoRefresh: true });
    root.querySelector("#map-filter")?.addEventListener("change", (e)=>{
      controller?.setFilter?.(e.target.value);
    });
  }

  // KPI modals
  const ensure = (sel, fn)=> root.querySelector(sel)?.addEventListener("click", fn);

  ensure("#kpi-card-active-vessels", ()=>{
    const active = (V||[]).filter(v=>{
      const st = (v.status||"").toString().toLowerCase();
      return st.includes("active") || st.includes("underway") || Number(v.speed||0) > 0.5;
    });
    showModal("Active Vessels Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${active.length} active vessel${active.length===1?"":"s"} found.`),
        table(active, [
          { label:"Name",    value:(r)=> r.name || "—" },
          { label:"IMO",     value:(r)=> r.imo  || "—" },
          { label:"Status",  value:(r)=> r.status || (Number(r.speed||0)>0.5 ? "Underway" : "—") },
          { label:"Speed",   value:(r)=> r.speed!=null ? `${r.speed} kts` : "—" },
          { label:"Heading", value:(r)=> r.heading!=null ? `${r.heading}°` : "—" },
          { label:"Lat",     value:(r)=> Array.isArray(r.position)? String(r.position[0]) : "—" },
          { label:"Lon",     value:(r)=> Array.isArray(r.position)? String(r.position[1]) : "—" },
        ]),
        h("div",{class:"mt-4 flex gap-2"},[
          h("a",{href:"#/vessels", class:"px-3 py-1.5 rounded-md bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm"},"Go to Vessels"),
          h("button",{class:"px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm", onClick:destroyModal},"Close")
        ])
      ])
    );
  });

  ensure("#kpi-card-open-tickets", ()=>{
    const open = (T||[]).filter(t => (t.status||"").toLowerCase() !== "closed");
    const pill = (p)=>{
      const cls = ({"Low":"bg-blue-900/50 text-blue-300","Medium":"bg-yellow-900/50 text-yellow-300","High":"bg-red-900/50 text-red-300"})[p] || "bg-slate-700/50 text-slate-200";
      return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`}, p||"—");
    };
    showModal("Open Tickets Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${open.length} open ticket${open.length===1?"":"s"} found.`),
        table(open, [
          { label:"Title",    value:(r)=> r.title || "—" },
          { label:"Vessel",   value:(r)=> r.vesselId!=null ? `#${r.vesselId}` : "—" },
          { label:"Priority", value:(r)=> pill(r.priority) },
          { label:"Status",   value:(r)=> r.status || "—" },
          { label:"Created",  value:(r)=> r.createdAt ? new Date(r.createdAt).toLocaleString() : "—" },
          { label:"Assignee", value:(r)=> r.assignee || "—" }
        ]),
        h("div",{class:"mt-4 flex gap-2"},[
          h("a",{href:"#/tickets", class:"px-3 py-1.5 rounded-md bg-blue-900/50 text-cyan-300 hover:bg-blue-900/70 text-sm"},"Go to Tickets"),
          h("button",{class:"px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm", onClick:destroyModal},"Close")
        ])
      ])
    );
  });

  ensure("#kpi-card-total-fuel", ()=>{
    const rows = (F||[]).map(t=>{
      const pct = Math.max(0, Math.min(100, typeof t.percent==="number" ? t.percent : (t.capacity ? Math.round(((t.liters??0)/t.capacity)*100) : 0)));
      const liters = t.capacity ? Math.round((pct/100)*Number(t.capacity)) : (t.liters ?? 0);
      return {...t, pct, liters};
    });
    const total = rows.reduce((a,b)=> a + (b.liters||0), 0);
    showModal("Fuel Inventory Overview",
      h("div",{},[
        h("div",{class:"mb-1 text-sm text-slate-400"}, `Total fuel: ${total.toLocaleString()} L across ${rows.length} tank${rows.length===1?"":"s"}.`),
        table(rows, [
          { label:"Tank",     value:(r)=> r.name || "—" },
          { label:"Vessel",   value:(r)=> r.vessel || "—" },
          { label:"Type",     value:(r)=> r.type || "—" },
          { label:"Level",    value:(r)=> `${r.pct}%` },
          { label:"Liters",   value:(r)=> (r.liters||0).toLocaleString() },
          { label:"Capacity", value:(r)=> r.capacity!=null ? `${Number(r.capacity).toLocaleString()} L` : "—" },
          { label:"Status",   value:(r)=> (r.pct) < 20 ? "Low" : "Normal" }
        ])
      ])
    );
  });

  ensure("#kpi-card-alerts", ()=>{
    showModal("System Alerts Overview",
      h("div",{},[
        h("div",{class:"mb-3 text-sm text-slate-400"}, `${(A||[]).length} alert${(A||[]).length===1?"":"s"} total.`),
        table((A||[]), [
          { label:"Title",     value:(r)=> r.title || r.type || "—" },
          { label:"Severity",  value:(r)=> {
              const s = (r.severity||"").toLowerCase();
              const cls = s==="critical" ? "bg-red-900/50 text-red-300"
                       : s==="high"      ? "bg-orange-900/50 text-orange-300"
                       : s==="warning"   ? "bg-yellow-900/50 text-yellow-300"
                       : "bg-blue-900/40 text-blue-300";
              return h("span",{class:`text-xs px-2 py-0.5 rounded-full ${cls}`}, r.severity||"Info");
            } },
          { label:"Message",   value:(r)=> r.message || r.desc || "—" },
          { label:"Vessel",    value:(r)=> r.vessel || (r.vesselId!=null?`#${r.vesselId}`:"—") },
          { label:"Time",      value:(r)=> r.createdAt ? new Date(r.createdAt).toLocaleString() : (r.time ? new Date(r.time).toLocaleString() : "—") }
        ])
      ])
    );
  });

  return root;
}

// ---------------------------------------------------------
// Shared Leaflet vessel map builder (returns controller)
// ---------------------------------------------------------
export function initVesselMap(container, {vessels=[], autoRefresh=false}={}){
  if (!container || !window.L) return null;

  if (!container.style.minHeight) container.style.minHeight = "24rem";

  const map = L.map(container, { zoomControl: true, preferCanvas: true, inertia: true }).setView([20, 0], 2);
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
    updateWhenIdle:false, detectRetina:true, crossOrigin:true
  }).addTo(map);
  tiles.on("tileerror", e=> console.warn("Leaflet tile load error:", e));

  const invalidate = ()=> map && map.invalidateSize({ animate:false });
  requestAnimationFrame(invalidate); setTimeout(invalidate, 120); setTimeout(invalidate, 600);
  const ro = new ResizeObserver(()=> invalidate()); ro.observe(container);
  const onHash = ()=> setTimeout(invalidate, 0); window.addEventListener("hashchange", onHash);

  const icons = {
    cargo:   L.divIcon({className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#22d3ee;box-shadow:0 0 0 6px rgba(34,211,238,.25)"></div>'}),
    tanker:  L.divIcon({className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#f97316;box-shadow:0 0 0 6px rgba(249,115,22,.25)"></div>'}),
    support: L.divIcon({className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#a855f7;box-shadow:0 0 0 6px rgba(168,85,247,.25)"></div>'}),
    default: L.divIcon({className:"", html:'<div style="width:14px;height:14px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.25)"></div>'}),
  };
  const iconFor = t => icons[t] || icons.default;

  const inferType = (v)=>{
    const t = (v.type||"").toString().toLowerCase();
    if (t) return t;
    const n = (v.name||"").toLowerCase();
    if (n.includes("tank")) return "tanker";
    if (n.includes("support") || n.includes("tug") || n.includes("assist")) return "support";
    return "cargo";
  };
  const seededPos = (seedStr)=>{
    let h=0; for (let i=0;i<seedStr.length;i++) h=(h*31 + seedStr.charCodeAt(i))>>>0;
    const lat = ((h % 12000) / 100) - 60;             // -60..60
    const lon = ((((h/12000)|0) % 36000) / 100) - 180;// -180..180
    return [lat, lon];
  };
  const normalize = (v)=>{
    let pos = Array.isArray(v.position) ? v.position
            : (v.lat!=null && v.lon!=null ? [v.lat, v.lon] : null);
    if (!pos) pos = seededPos(String(v.id||v.imo||v.name||Math.random()));
    return {...v, position: pos, _type: inferType(v)};
  };

  const tooltipHtml = (v)=> `<div><strong>${v.name || "Vessel"}</strong><br>
    <span>Type: ${v._type || "—"}</span><br>
    <span>Speed: ${v.speed!=null ? v.speed+" kts" : "—"} • Heading: ${v.heading!=null ? v.heading+"°" : "—"}</span></div>`;

  const popupHtml = (v)=> `<div class="text-sm">
    <div class="font-medium">${v.name || "Vessel"}</div>
    <div>Type: ${v._type || "—"}</div>
    <div>IMO: ${v.imo || "—"}</div>
    <div>Status: ${v.status || "—"}</div>
    <div>Speed: ${v.speed!=null ? v.speed+" kts" : "—"}</div>
    <div>Heading: ${v.heading!=null ? v.heading+"°" : "—"}</div>
  </div>`;

  let data = (vessels||[]).map(normalize);
  const markers = new Map();
  let currentFilter = "all";

  function refresh(){
    const rows = currentFilter==="all" ? data : data.filter(v=> v._type===currentFilter);
    const still = new Set();
    rows.forEach(v=>{
      if (!Array.isArray(v.position) || v.position.length!==2) return;
      const [lat, lon] = v.position;
      const key = String(v.id||v.imo||v.name);
      still.add(key);
      if (markers.has(key)){
        const m = markers.get(key);
        m.setLatLng([lat, lon]).setIcon(iconFor(v._type)).setPopupContent(popupHtml(v));
        if (m.getTooltip()) m.setTooltipContent(tooltipHtml(v));
      } else {
        const m = L.marker([lat, lon], {icon: iconFor(v._type)})
          .addTo(map)
          .bindPopup(popupHtml(v))
          .bindTooltip(tooltipHtml(v), {direction:"top", offset:[0,-10], sticky:true, opacity:0.95, className:"maptip"});
        markers.set(key, m);
      }
    });
    for (const k of Array.from(markers.keys())) {
      if (!still.has(k)) { map.removeLayer(markers.get(k)); markers.delete(k); }
    }
    invalidate();
  }
  function setFilter(type){ currentFilter = type; refresh(); }
  function update(list){ data = (list||[]).map(normalize); refresh(); }

  refresh();

  let interval=null;
  if (autoRefresh){
    interval = setInterval(async ()=>{
      try { const fresh = await jget("/vessels"); update(fresh); } catch {}
    }, 10000);
  }

  const deathObs = new MutationObserver(()=>{
    if(!document.body.contains(container)){
      try{ ro.disconnect(); }catch{}
      try{ window.removeEventListener("hashchange", onHash); }catch{}
      try{ interval && clearInterval(interval); }catch{}
      try{ map.remove(); }catch{}
      deathObs.disconnect();
    }
  });
  deathObs.observe(document.body,{childList:true,subtree:true});

  return { setFilter, update, map };
}
