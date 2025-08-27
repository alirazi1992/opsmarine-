// src/main.js
// ---------------------------------------------------------
// Config + tiny API layer
// ---------------------------------------------------------
const API_BASE = (import.meta?.env?.VITE_API_BASE) || "http://localhost:7001";

const API = {
  get base() { return localStorage.getItem("apiBase") || API_BASE; },
  set base(v) { localStorage.setItem("apiBase", v); }
};

function api(path, opts = {}) {
  return fetch(`${API.base}${path}`, {
    headers: { "Content-Type":"application/json" },
    ...opts
  });
}
async function jget(p){ const r=await api(p); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
async function jpost(p,b){ const r=await api(p,{method:"POST",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
async function jpatch(p,b){ const r=await api(p,{method:"PATCH",body:JSON.stringify(b)}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
async function jdel(p){ const r=await api(p,{method:"DELETE"}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }

// ---------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------
export const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (c instanceof Node) el.appendChild(c);
    else if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(document.createTextNode(JSON.stringify(c)));
  });
  return el;
};
const qs = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> Array.from(r.querySelectorAll(s));

function panel(title, content){
  return h("div",{class:"glass-panel rounded-2xl p-4 border border-slate-800/50"},[
    h("h2",{class:"text-lg font-semibold mb-3"}, title),
    content
  ]);
}
const kpi = (label,val)=> h("div",{class:"rounded-xl bg-slate-800/60 p-4"},[
  h("div",{class:"text-slate-300 text-sm"}, label),
  h("div",{class:"text-2xl font-bold"}, typeof val==="function"? String(val()): String(val))
]);

// Safe table
function table(items, columns){
  const thead = h("thead",{class:"border-b border-slate-800/60"},
    h("tr",{}, columns.map(c=>h("th",{class:"py-2 pr-4 font-semibold text-left"}, c.label)))
  );
  const tbody = h("tbody");
  items.forEach(row=>{
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
// Sidebar + theme (IDs exist in your HTML)
// ---------------------------------------------------------
qs("#openSidebar")?.addEventListener("click", ()=>{ qs("#sidebar").classList.add("open"); qs("#overlay").classList.add("open"); });
qs("#closeSidebar")?.addEventListener("click", ()=>{ qs("#sidebar").classList.remove("open"); qs("#overlay").classList.remove("open"); });
qs("#overlay")?.addEventListener("click", ()=>{ qs("#sidebar").classList.remove("open"); qs("#overlay").classList.remove("open"); });

document.getElementById("btnLight")?.addEventListener("click", ()=>{ document.documentElement.classList.add("light"); localStorage.setItem("theme","light"); });
document.getElementById("btnDark") ?.addEventListener("click", ()=>{ document.documentElement.classList.remove("light"); localStorage.setItem("theme","dark"); });

// ---------------------------------------------------------
// Router
// ---------------------------------------------------------
const routes = {
  "/dashboard": renderDashboard,
  "/vessels": routeVessels,
  "/tickets": routeTickets,
  "/new-ticket": routeNewTicket,
  "/fuel": routeFuel
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
    view.appendChild(h("pre",{class:"text-red-400 whitespace-pre-wrap"}, String(err)));
  }
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", ()=>{ if(!location.hash) location.hash="#/dashboard"; router(); });

// ---------------------------------------------------------
// Dashboard (with Leaflet map in #leaflet-map-dashboard)
// ---------------------------------------------------------
async function renderDashboard(){
  const tpl = qs("#tmpl-dashboard")?.content?.cloneNode(true) || h("div",{},[]);
  const root = h("div",{},[tpl]);

  const [vesselsRes, ticketsRes, alertsRes, fuelRes] = await Promise.allSettled([
    jget("/vessels"), jget("/tickets"), jget("/alerts"), jget("/fuel")
  ]);
  const ok = s => s.status==="fulfilled" ? s.value : [];

  const V = ok(vesselsRes), T = ok(ticketsRes), A = ok(alertsRes), F = ok(fuelRes);
  const totFuel = F.reduce((a,b)=> a + (b.capacity ? Math.round((b.capacity * (b.percent||0))/100) : 0), 0);

  // update KPIs if those IDs exist in your template
  qs("#kpi-active-vessels", root)?.appendChild(document.createTextNode(String(V.length||0)));
  qs("#kpi-open-tickets",  root)?.appendChild(document.createTextNode(String(T.filter(t=>t.status!=="Closed").length||0)));
  qs("#kpi-total-fuel",    root)?.appendChild(document.createTextNode((totFuel||0).toLocaleString()));
  qs("#kpi-alerts",        root)?.appendChild(document.createTextNode(String(A.length||0)));
  const badge = qs("#alerts-count"); if (badge) badge.textContent = String(A.length||0);

  // recent tickets (if region exists)
  const recentWrap = qs("#recent-tickets", root);
  if (recentWrap && T.length){
    T.slice(-3).reverse().forEach(t=>{
      recentWrap.appendChild(
        h("div",{class:"p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition"},[
          h("div",{class:"flex items-start justify-between"},[
            h("div",{},[
              h("div",{class:"font-medium"}, t.title),
              h("div",{class:"text-xs text-slate-400 mt-1"}, `Vessel #${t.vesselId}`)
            ]),
            h("span",{class:`text-xs ${priorityClass(t.priority)} px-2 py-0.5 rounded-full`}, t.priority)
          ]),
          h("div",{class:"mt-2 text-xs text-slate-500"}, t.status)
        ])
      );
    });
  }

  // Leaflet map (Dashboard tile)
  const mapEl = qs("#leaflet-map-dashboard", root);
  if (mapEl && window.L) {
    // ensure height (Tailwind h-96 is already set in HTML)
    initVesselMap(mapEl, { vessels: V, autoRefresh: true });
  }

  return root;
}
function priorityClass(p){ return ({Low:"bg-blue-900/50 text-blue-300", Medium:"bg-yellow-900/50 text-yellow-300", High:"bg-red-900/50 text-red-300"})[p] || "bg-slate-700/50"; }

// ---------------------------------------------------------
// Shared Leaflet vessel map builder
// ---------------------------------------------------------
function initVesselMap(container, {vessels=[], autoRefresh=false}={}){
  // basic map (world view)
  const map = L.map(container, { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' }
  ).addTo(map);

  let markers = new Map();

  function upsertMarkers(list){
    const still = new Set();
    list.forEach(v=>{
      if (!Array.isArray(v.position) || v.position.length!==2) return;
      const [lat, lon] = v.position;
      const key = String(v.id||v.imo||v.name||Math.random());
      still.add(key);
      const popup = `<div class="text-sm">
        <div class="font-medium">${v.name||"Vessel"}</div>
        <div>IMO: ${v.imo||"—"}</div>
        <div>Status: ${v.status||"—"}</div>
        <div>Speed: ${v.speed!=null ? v.speed+" kts" : "—"}</div>
        <div>Heading: ${v.heading!=null ? v.heading+"°" : "—"}</div>
      </div>`;
      if (markers.has(key)){
        markers.get(key).setLatLng([lat, lon]).setPopupContent(popup);
      } else {
        const m = L.marker([lat, lon]).addTo(map).bindPopup(popup);
        markers.set(key, m);
      }
    });
    // remove markers not in this update
    Array.from(markers.keys()).forEach(k=>{
      if(!still.has(k)){ const m = markers.get(k); map.removeLayer(m); markers.delete(k); }
    });
  }

  upsertMarkers(vessels);

  // auto refresh
  if (autoRefresh){
    const interval = setInterval(async ()=>{
      try{
        const fresh = await jget("/vessels");
        upsertMarkers(fresh);
      }catch(_){}
    }, 10000);
    // when DOM node goes away, stop interval
    const obs = new MutationObserver(()=>{
      if(!document.body.contains(container)){ clearInterval(interval); obs.disconnect(); }
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  return map;
}

// ---------------------------------------------------------
// Vessels page (map + table)
// ---------------------------------------------------------
async function routeVessels(){
  const vessels = await jget("/vessels");

  const kpis = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Vessels", vessels.length),
    kpi("Underway", vessels.filter(v=>v.status==="Underway").length),
    kpi("At Berth", vessels.filter(v=>v.status==="At Berth").length),
    kpi("Anchored", vessels.filter(v=>v.status==="Anchored").length),
  ]);

  const cols = [
    {label:"Name", key:"name"},
    {label:"IMO", key:"imo"},
    {label:"Status", key:"status"},
    {label:"Speed (kts)", value:v=> v.speed!=null ? v.speed : "—"},
    {label:"Heading", value:v=> v.heading!=null ? v.heading+"°" : "—"},
    {label:"ETA (UTC)", value:v=> v.eta ? new Date(v.eta).toLocaleString() : "—"},
  ];
  const tbl = table(vessels, cols);

  const mapWrap = h("div",{class:"rounded-2xl overflow-hidden"},[
    h("div",{id:"leaflet-map-vessels", class:"h-96 rounded-2xl"})
  ]);

  const root = h("div",{class:"space-y-4"},[
    kpis,
    h("div",{class:"grid md:grid-cols-2 gap-4"},[
      panel("Vessels", tbl),
      panel("Live Map", mapWrap)
    ])
  ]);

  // mount map after node is in DOM
  queueMicrotask(()=>{
    const el = qs("#leaflet-map-vessels");
    if (el && window.L) initVesselMap(el, { vessels, autoRefresh: true });
  });

  return root;
}

// ---------------------------------------------------------
// Tickets list
// ---------------------------------------------------------
async function routeTickets(){
  let tickets = await jget("/tickets");
  const columns = [
    {label:"ID", key:"id"},
    {label:"Title", key:"title"},
    {label:"Priority", key:"priority"},
    {label:"Status", value:t=> h("span",{class:"px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-700"}, t.status)},
    {label:"Actions", value:t=> h("div",{class:"flex gap-2"},[
      h("button",{class:"px-2 py-1 bg-slate-800 rounded border border-slate-700", onClick: async()=>{
        const next = nextStatus(t.status); await jpatch(`/tickets/${t.id}`, {status: next});
        tickets = await jget("/tickets"); rerender();
      }},"Next"),
      h("button",{class:"px-2 py-1 bg-rose-700 rounded", onClick: async()=>{
        await jdel(`/tickets/${t.id}`); tickets = await jget("/tickets"); rerender();
      }},"Delete")
    ])}
  ];
  const draw = ()=> table(tickets, columns);
  let node = draw();
  function rerender(){ const n = draw(); node.replaceWith(n); node = n; }
  return panel("IT Ticketing", h("div",{},[
    h("div",{class:"mb-3"}, h("a",{href:"#/new-ticket", class:"text-cyan-400 hover:underline"},"Create new ticket")),
    node
  ]));
}
function nextStatus(s){ const steps=["Open","In Progress","Closed"]; return steps[(steps.indexOf(s)+1)%steps.length]||"Open"; }

// ---------------------------------------------------------
// New Ticket
// ---------------------------------------------------------
async function routeNewTicket(){
  const vessels = await jget("/vessels");
  const form = h("form",{class:"grid gap-3 max-w-xl"},[
    input("title","Title"),
    select("priority",["Low","Medium","High"]),
    select("status",["Open","In Progress","Closed"]),
    vesselSelect(vessels),
    h("button",{type:"submit",class:"px-4 py-2 bg-blue-600 rounded"},"Create Ticket")
  ]);
  const msg = h("div",{class:"text-green-400 mt-2 hidden"},"Ticket created!");
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const body = {
      title: form.querySelector("#title").value.trim(),
      priority: form.querySelector("#priority").value,
      status: form.querySelector("#status").value,
      vesselId: parseInt(form.querySelector("#vesselId").value,10)
    };
    await jpost("/tickets", body);
    form.reset(); msg.classList.remove("hidden");
    setTimeout(()=> location.hash="#/tickets", 600);
  });
  return panel("New Ticket", h("div",{},[form, msg]));
}
function input(id, ph){ return h("input",{id,placeholder:ph, class:"p-2 rounded bg-slate-800 border border-slate-700", required:true}); }
function select(id, opts){ return h("select",{id, class:"p-2 rounded bg-slate-800 border border-slate-700", required:true},
  [h("option",{value:""},"Select ..."), ...opts.map(o=>h("option",{value:o},o))]
);}
function vesselSelect(vessels){ return h("select",{id:"vesselId", class:"p-2 rounded bg-slate-800 border border-slate-700", required:true},
  [h("option",{value:""},"Assign to vessel"), ...vessels.map(v=>h("option",{value:v.id}, v.name))]
);}

// ---------------------------------------------------------
// Fuel Monitoring (enhanced)
// ---------------------------------------------------------
async function routeFuel(){
  let tanks = await jget("/fuel");
  let filters = { vessel: "ALL", type: "ALL", criticalOnly: false, search: "" };

  const header = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Tanks", ()=> filtered().length),
    kpi("Avg Fill", ()=> (avgPct(filtered())||0) + "%"),
    kpi("Critical (<20%)", ()=> filtered().filter(t=> pct(t)<20).length),
    kpi("Types", ()=> uniq(tanks.map(t=>t.type)).length)
  ]);

  const toolbar = fuelToolbar(tanks, filters, {
    onChange(){ rerender(); },
    onRefresh: async ()=>{
      tanks = await jget("/fuel");
      rerender(true);
    },
    onAdd: ()=>{
      openFuelModal({
        title: "Log Refuel / Transfer",
        submitLabel: "Save Log",
        tanks,
        onSubmit: async (payload)=>{
          try {
            await jpost("/fuel/logs", payload);
          } catch(e){
            const tank = tanks.find(t=> t.id === payload.tankId);
            if (tank && Number(tank.capacity)){
              const currentL = Number(tank.liters ?? Math.round((pct(tank)/100)*Number(tank.capacity)));
              const newL = Math.max(0, currentL + Number(payload.liters || 0));
              const newPct = Math.max(0, Math.min(100, Math.round((newL/Number(tank.capacity))*100)));
              await jpatch(`/fuel/${tank.id}`, { percent: newPct, liters: newL });
            }
          }
          tanks = await jget("/fuel");
          rerender(true);
        }
      });
    }
  });

  const cardsWrap = h("div",{class:"grid md:grid-cols-3 gap-4"});

  let stopRefresh = autoRefresh(async ()=>{
    tanks = await jget("/fuel");
    rerender(true);
  }, 10000);

  const root = panel("Fuel Monitoring", h("div",{},[
    header,
    toolbar.node,
    cardsWrap
  ]));

  function uniq(arr){ return Object.keys(arr.reduce((m,x)=>((m[String(x||"—")]=1),m),{})); }
  function pct(t){ return Math.max(0, Math.min(100, t.percent ?? (t.capacity ? Math.round((Number(t.liters||0)/Number(t.capacity))*100) : 0))); }
  function filtered(){
    let out = tanks.slice();
    if (filters.vessel !== "ALL") out = out.filter(t=> (t.vessel||"—") === filters.vessel);
    if (filters.type   !== "ALL") out = out.filter(t=> (t.type||"—")   === filters.type);
    if (filters.criticalOnly) out = out.filter(t=> pct(t) < 20);
    if (filters.search.trim()){
      const q = filters.search.trim().toLowerCase();
      out = out.filter(t=>
        String(t.name||"").toLowerCase().includes(q) ||
        String(t.vessel||"").toLowerCase().includes(q) ||
        String(t.type||"").toLowerCase().includes(q)
      );
    }
    return out;
  }
  function renderKPIs(){
    const wrap = header; wrap.innerHTML = "";
    wrap.appendChild(kpi("Total Tanks", filtered().length));
    wrap.appendChild(kpi("Avg Fill", (avgPct(filtered())||0) + "%"));
    wrap.appendChild(kpi("Critical (<20%)", filtered().filter(t=> pct(t)<20).length));
    wrap.appendChild(kpi("Types", uniq(tanks.map(t=>t.type)).length));
  }
  function rerender(fromRefresh=false){
    renderKPIs();
    cardsWrap.innerHTML = "";
    const list = filtered();
    if (!list.length){
      cardsWrap.appendChild(h("div",{class:"text-slate-400 text-sm col-span-full py-8 text-center"},"No tanks match your filters."));
    } else {
      list.forEach(t=> cardsWrap.appendChild(fuelCard(t)));
    }
    if (!fromRefresh) {
      stopRefresh();
      stopRefresh = autoRefresh(async ()=>{
        tanks = await jget("/fuel"); rerender(true);
      }, 10000);
    }
  }
  function fuelCard(t){
    const percentage = pct(t);
    const statusClass = percentage<20 ? 'bg-yellow-900/30 text-yellow-400'
                      : percentage<50 ? 'bg-blue-900/30 text-blue-400'
                      : 'bg-green-900/30 text-green-400';
    const liters = (()=>{
      if (t.liters!=null) return Number(t.liters);
      if (t.capacity) return Math.round((percentage/100)*Number(t.capacity));
      return null;
    })();

    const head = h("div",{class:"flex items-center justify-between mb-2"},[
      h("div",{class:"font-medium flex items-center gap-2"},[
        h("span",{}, t.name || "Tank"),
        t.capacity ? h("span",{class:"text-xs text-slate-500"},"• Cap "+formatLiters(t.capacity)) : ""
      ]),
      h("div",{class:`text-xs ${statusClass} px-2 py-0.5 rounded-full`}, percentage<20 ? 'Low' : 'Normal')
    ]);

    const sub = h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel || '—'} • ${t.type || '—'}`);

    const g = gauge(percentage, liters);

    const btn = (label, delta)=> h("button",{
      class:"px-2 py-1 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-xs",
      onClick: async ()=>{
        const newPct = Math.max(0, Math.min(100, percentage + delta));
        const body = { percent: newPct };
        if (t.capacity) body.liters = Math.round((newPct/100)*Number(t.capacity));
        await jpatch(`/fuel/${t.id}`, body);
        const fresh = await jget("/fuel");
        const updated = fresh.find(x=>x.id===t.id);
        Object.assign(t, updated||t);
        rerender(true);
      }
    }, label);

    const quick = h("div",{class:"flex gap-2"},[
      btn("-5%", -5), btn("+5%", +5), btn("+10%", +10),
      h("button",{
        class:"px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs",
        onClick: ()=>{
          openFuelModal({
            title: `Log refuel: ${t.name || 'Tank'}`,
            submitLabel: "Apply",
            tanks: [t],
            onSubmit: async ({tankId, liters})=>{
              const target = tanks.find(x=>x.id===tankId) || t;
              if (target && Number(target.capacity)){
                const currentL = Number(target.liters ?? Math.round((pct(target)/100)*Number(target.capacity)));
                const newL = Math.max(0, currentL + Number(liters||0));
                const newPct = Math.max(0, Math.min(100, Math.round((newL/Number(target.capacity))*100)));
                await jpatch(`/fuel/${target.id}`, { liters: newL, percent: newPct });
                const fresh = await jget("/fuel");
                Object.assign(t, fresh.find(x=>x.id===t.id)||t);
                rerender(true);
              } else {
                try { await jpost("/fuel/logs", { tankId, liters }); } catch(_){}
                tanks = await jget("/fuel"); rerender(true);
              }
            }
          });
        }
      },"Log refuel")
    ]);

    return h("div",{class:"bg-slate-800/30 rounded-xl p-4 border border-slate-800/50"},[
      head, sub, g,
      h("div",{class:"flex items-center justify-between text-xs mt-1"},[
        h("span",{class:"text-slate-400"}, t.capacity ? `Cap: ${formatLiters(t.capacity)}` : ""),
        h("span",{class:"text-slate-400"}, liters!=null ? `${formatLiters(liters)} now` : "")
      ]),
      h("div",{class:"mt-3 flex flex-wrap gap-2"}, quick)
    ]);
  }
  rerender();
  return root;
}

// toolbar + helpers
function fuelToolbar(tanks, filters, {onChange, onRefresh, onAdd}){
  const uniqVal = (arr,key)=> ["ALL", ...Array.from(new Set(arr.map(x=> (x?.[key] || "—"))))];
  const vesselSel = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"}, uniqVal(tanks,"vessel").map(o=>h("option",{value:o},o)));
  const typeSel   = h("select",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm"}, uniqVal(tanks,"type").map(o=>h("option",{value:o},o)));
  vesselSel.value = filters.vessel; typeSel.value = filters.type;

  vesselSel.addEventListener("change", e=>{ filters.vessel = e.target.value; onChange(); });
  typeSel.addEventListener("change",   e=>{ filters.type   = e.target.value; onChange(); });

  const crit = h("input",{type:"checkbox", class:"accent-cyan-500"});
  crit.checked = filters.criticalOnly;
  crit.addEventListener("change", e=>{ filters.criticalOnly = e.target.checked; onChange(); });

  const search = h("input",{class:"p-2 rounded bg-slate-800 border border-slate-700 text-sm", placeholder:"Search tank / vessel / type"});
  search.addEventListener("input", e=>{ filters.search = e.target.value; onChange(); });

  const node = h("div",{class:"mb-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between"},[
    h("div",{class:"flex flex-wrap gap-2"},[
      h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Vessel"), vesselSel]),
      h("label",{class:"text-sm flex items-center gap-2"},[h("span",{class:"text-slate-400"},"Type"), typeSel]),
      h("label",{class:"text-sm flex items-center gap-2"},[crit, h("span",{class:"text-slate-400"},"Critical <20%")]),
    ]),
    h("div",{class:"flex flex-wrap gap-2"},[
      search,
      h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-sm", onClick:onRefresh}, [h("i",{class:"fas fa-rotate mr-2"}),"Refresh"]),
      h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm", onClick:onAdd}, [h("i",{class:"fas fa-plus mr-2"}),"Log Refuel / Transfer"])
    ])
  ]);
  return { node };
}

function formatLiters(n){ return Number(n).toLocaleString()+"L"; }
function autoRefresh(fn, ms){ let id=setInterval(fn,ms); return ()=>clearInterval(id); }
function gauge(pct, liters){
  pct = Math.max(0, Math.min(100, Math.round(pct||0)));
  return h("div",{class:"flex items-center justify-center mb-3"},[
    h("div",{class:"fuel-gauge"},[
      h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
        h("path",{class:"fuel-gauge-circle fuel-gauge-bg", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831", "stroke-dasharray":"100, 100"}),
        h("path",{class:"fuel-gauge-circle fuel-gauge-fill", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831", "stroke-dasharray":`${pct}, 100`}),
      ]),
      h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
        h("div",{class:"text-xl font-bold"}, `${pct}%`),
        liters!=null ? h("div",{class:"text-xs text-slate-400"}, formatLiters(liters)) : ""
      ])
    ])
  ]);
}
function avgPct(arr){ return Math.round(arr.reduce((a,b)=>a+(Math.max(0,Math.min(100,b.percent||0))),0)/Math.max(1,arr.length)); }

// ---------------------------------------------------------
// Simple modal for Fuel actions
// ---------------------------------------------------------
function openFuelModal({title, submitLabel="Save", tanks=[], onSubmit}){
  const wrap = h("div",{class:"fixed inset-0 z-50 flex items-center justify-center"});
  const overlay = h("div",{class:"absolute inset-0 bg-black/60"});
  const panelEl = h("div",{class:"relative z-10 w-full max-w-md glass-panel rounded-2xl p-4 border border-slate-800/50"});

  const sel = h("select",{class:"w-full p-2 rounded bg-slate-800 border border-slate-700", required:true},
    tanks.map(t=> h("option",{value:t.id}, `${t.name||"Tank"} — ${t.vessel||"—"} (${t.type||"—"})`))
  );
  const liters = h("input",{type:"number", step:"1", placeholder:"Liters (+/-)", class:"w-full p-2 rounded bg-slate-800 border border-slate-700", required:true});

  const close = ()=> document.body.removeChild(wrap);

  panelEl.appendChild(
    h("div",{class:"space-y-3"},[
      h("div",{class:"flex items-center justify-between"},[
        h("h3",{class:"text-lg font-semibold"}, title),
        h("button",{class:"text-slate-400 hover:text-white", onClick:close}, h("i",{class:"fas fa-times"}))
      ]),
      tanks.length>1 ? h("div",{},[h("label",{class:"text-sm text-slate-300"},"Tank"), sel]) : "",
      h("div",{},[h("label",{class:"text-sm text-slate-300"},"Liters (use negative for transfer out)"), liters]),
      h("div",{class:"pt-2 flex justify-end gap-2"},[
        h("button",{class:"px-3 py-2 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50", onClick:close},"Cancel"),
        h("button",{class:"px-3 py-2 rounded bg-blue-600 hover:bg-blue-500", onClick: async ()=>{
          const payload = {
            tankId: Number(tanks.length>1 ? sel.value : tanks[0].id),
            liters: Number(liters.value||0)
          };
          if (typeof onSubmit === "function") await onSubmit(payload);
          close();
        }}, submitLabel)
      ])
    ])
  );

  wrap.appendChild(overlay);
  wrap.appendChild(panelEl);
  document.body.appendChild(wrap);
}
