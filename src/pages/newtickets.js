import { h, jget, jpost, panel } from "../main.js";

export async function routeNewTicket(){
  const vessels = await jget("/vessels");

  const form = h("form",{class:"grid gap-3 max-w-xl"},[
    input("title","Title"),
    select("priority", ["Low","Medium","High"]),
    select("status",   ["Open","In Progress","Closed"]),
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
    form.reset();
    msg.classList.remove("hidden");
    setTimeout(()=>location.hash="#/tickets", 600);
  });

  return panel("New Ticket", h("div",{},[form, msg]));
}

function input(id, ph){
  return h("input",{id,placeholder:ph, class:"p-2 rounded bg-slate-800 border border-slate-700", required:true});
}
function select(id, opts){
  return h("select",{id, class:"p-2 rounded bg-slate-800 border border-slate-700", required:true},
    [h("option",{value:""},"Select ..."), ...opts.map(o=>h("option",{value:o}, o))]
  );
}
function vesselSelect(vessels){
  return h("select",{id:"vesselId", class:"p-2 rounded bg-slate-800 border border-slate-700", required:true},
    [h("option",{value:""},"Assign to vessel"), ...vessels.map(v=>h("option",{value:v.id}, v.name))]
  );
}
