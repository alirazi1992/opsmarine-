import { h, jget, kpi, panel, table } from "../main.js";

export async function routeVessels(){
  const vessels = await jget("/vessels");

  const kpis = h("div",{class:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"},[
    kpi("Total Vessels", vessels.length),
    kpi("Underway", vessels.filter(v=>v.status==="Underway").length),
    kpi("At Berth", vessels.filter(v=>v.status==="At Berth").length),
    kpi("Anchored", vessels.filter(v=>v.status==="Anchored").length),
  ]);

  const cols = [
    {label:"Name",   key:"name"},
    {label:"IMO",    key:"imo"},
    {label:"Status", key:"status"},
    {label:"ETA (UTC)", value:v=> v.eta ? new Date(v.eta).toLocaleString() : "—"},
  ];

  const tbl = table(vessels, cols);
  const map = h("div",{class:"rounded-2xl bg-slate-900/60 p-4 h-64 flex items-center justify-center"}, "🗺️ Map placeholder");

  return h("div",{class:"space-y-4"},[
    kpis,
    h("div",{class:"grid md:grid-cols-2 gap-4"},[
      panel("Vessels", tbl),
      panel("Map", map)
    ])
  ]);
}
