import { h, panel, API } from "../main.js";

export async function routeSettings(){
  const apiInput = h("input",{id:"api", class:"p-2 rounded bg-slate-800 border border-slate-700 w-full", value: (API.base || "")});
  const themeSel = h("select",{id:"theme", class:"p-2 rounded bg-slate-800 border border-slate-700 w-full"},[
    h("option",{value:"dark"},"Dark"),
    h("option",{value:"light"},"Light"),
  ]);
  themeSel.value = localStorage.getItem("theme") || "dark";

  const save = h("button",{class:"px-4 py-2 bg-blue-600 rounded"},"Save");
  save.addEventListener("click", ()=>{
    const newBase = apiInput.value.trim();
    if (newBase) API.base = newBase;
    localStorage.setItem("theme", themeSel.value);
    alert("Saved. Reloading…");
    location.reload();
  });

  return panel("Settings", h("div",{class:"max-w-xl space-y-3"},[
    h("div",{}, [h("label",{class:"text-sm text-slate-300"},"API Base URL"), apiInput]),
    h("div",{}, [h("label",{class:"text-sm text-slate-300"},"Theme"), themeSel]),
    save
  ]));
}
