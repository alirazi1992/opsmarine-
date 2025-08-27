import { h, jget, jdel, panel, table } from "../main.js";

export async function routeAlerts(){
  let alerts = await jget("/alerts");

  const columns = [
    {label:"ID", key:"id"},
    {label:"Level", key:"level"},
    {label:"Message", key:"message"},
    {label:"Vessel", key:"vesselId"},
    {label:"Created", value:a=> a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"},
    {label:"Actions", value:a=> h("button",{class:"px-2 py-1 bg-rose-700 rounded", onClick: async()=>{
      await jdel(`/alerts/${a.id}`);
      alerts = await jget("/alerts");
      rerender();
    }},"Delete")}
  ];

  function draw(){ return table(alerts, columns); }
  let node = draw();
  function rerender(){ const n = draw(); node.replaceWith(n); node = n; }

  return panel("Alerts", node);
}
