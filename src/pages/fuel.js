import { h, jget, kpi, panel } from "../main.js";

export async function routeFuel(){
  const tanks = await jget("/fuel");

  const head = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Tanks", tanks.length),
    kpi("Avg Fill", (avgPct(tanks) || 0) + "%"),
    kpi("Critical (<20%)", tanks.filter(t=>t.percent<20).length),
    kpi("Types", Object.keys(groupBy(tanks,"type")).length)
  ]);

  const cards = h("div",{class:"grid md:grid-cols-3 gap-4"}, tanks.map(t=>card(t)));
  return panel("Fuel Monitoring", h("div",{},[head, cards]));
}

function card(t){
  const pct = Math.max(0, Math.min(100, t.percent ?? 0));
  const statusLow = pct < 20;
  return h("div",{class:"bg-slate-800/30 rounded-xl p-4 border border-slate-800/50"},[
    h("div",{class:"flex items-center justify-between mb-2"},[
      h("div",{class:"font-medium"}, t.name || "Tank"),
      h("div",{class:`text-xs ${statusLow?'bg-yellow-900/30 text-yellow-400':'bg-green-900/30 text-green-400'} px-2 py-0.5 rounded-full`}, statusLow?'Low':'Normal')
    ]),
    h("div",{class:"text-xs text-slate-400 mb-3"}, `${t.vessel || '—'} • ${t.type || '—'}`),
    gauge(pct, t.liters)
  ]);
}

function gauge(pct, liters){
  return h("div",{class:"flex items-center justify-center mb-3"},[
    h("div",{class:"fuel-gauge"},[
      h("svg",{viewBox:"0 0 36 36", class:"fuel-gauge"},[
        h("path",{class:"fuel-gauge-circle fuel-gauge-bg", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":"100, 100"}),
        h("path",{class:"fuel-gauge-circle fuel-gauge-fill", d:"M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831","stroke-dasharray":`${pct}, 100`}),
      ]),
      h("div",{class:"absolute inset-0 flex items-center justify-center flex-col"},[
        h("div",{class:"text-xl font-bold"}, `${pct}%`),
        liters!=null ? h("div",{class:"text-xs text-slate-400"}, `${Number(liters).toLocaleString()}L`) : ""
      ])
    ])
  ]);
}

function groupBy(arr, key){ return arr.reduce((m,x)=>((m[x[key]]??=[]).push(x),m),{}); }
function avgPct(arr){ return Math.round(arr.reduce((a,b)=>a+(b.percent||0),0)/Math.max(1,arr.length)); }
