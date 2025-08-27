import { h, jget, panel, table } from "../main.js";

export async function routeReports(){
  const reports = await jget("/reports");

  const t = table(reports.map(r=>({
    ...r,
    createdLocal: r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"
  })), [
    {label:"ID", key:"id"},
    {label:"Title", key:"title"},
    {label:"Type", key:"type"},
    {label:"Created", key:"createdLocal"},
    {label:"Link", value:r=> r.url ? h("a",{href:r.url, target:"_blank", class:"text-blue-400 underline"},"Open") : "—"}
  ]);

  const exportBtn = h("button",{class:"px-3 py-1 bg-slate-800 rounded border border-slate-700 mt-3"},"Export CSV");
  exportBtn.addEventListener("click", ()=>{
    const rows = [["ID","Title","Type","Created","URL"], ...reports.map(r=>[
      r.id, r.title, r.type, r.createdAt || "", r.url || ""
    ])];
    const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "reports.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  return panel("Reports", h("div",{},[t, exportBtn]));
}
