import { h, jget, jpatch, jdel, panel, table } from "../main.js";

export async function routeTickets(){
  let tickets = await jget("/tickets");

  const columns = [
    {label:"ID", key:"id"},
    {label:"Title", key:"title"},
    {label:"Priority", key:"priority"},
    {label:"Status", value:t=>badge(t.status)},
    {label:"Actions", value:t=>actions(t)}
  ];

  function badge(s){
    const cls = s==="Open" ? "bg-blue-900/50 text-blue-300"
              : s==="In Progress" ? "bg-yellow-900/50 text-yellow-300"
              : "bg-emerald-900/50 text-emerald-300";
    return h("span",{class:`px-2 py-0.5 rounded text-xs ${cls}`}, s);
  }

  function actions(t){
    return h("div",{class:"flex gap-2"},[
      h("button",{class:"px-2 py-1 bg-slate-800 rounded border border-slate-700",
        onClick: async()=>{
          const next = nextStatus(t.status);
          await jpatch(`/tickets/${t.id}`, {status: next});
          tickets = await jget("/tickets");
          rerender();
        }}, "Next"),
      h("button",{class:"px-2 py-1 bg-rose-700 rounded",
        onClick: async()=>{
          await jdel(`/tickets/${t.id}`);
          tickets = await jget("/tickets");
          rerender();
        }}, "Delete")
    ]);
  }

  function draw(){ return table(tickets, columns); }
  let node = draw();
  function rerender(){ const n = draw(); node.replaceWith(n); node = n; }

  return panel("IT Ticketing", h("div",{},[
    h("div",{class:"mb-3"}, h("a",{href:"#/new-ticket", class:"text-cyan-400 hover:underline"},"Create new ticket")),
    node
  ]));
}

function nextStatus(s){
  const steps = ["Open","In Progress","Closed"];
  return steps[(steps.indexOf(s)+1)%steps.length] || "Open";
}
