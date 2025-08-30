// src/routes/reports.js
import { h, jget, panel, table } from "../main.js";

export async function routeReports(){
  const reports = await jget("/reports");

  // ---------- PLOTTING HELPERS (no external libs) ----------
  const makeSVG = (w,h) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("width", w);
    s.setAttribute("height", h);
    s.classList.add("w-full", "h-auto");
    return s;
  };
  const NS = "http://www.w3.org/2000/svg";
  const S = (name, attrs={}) => {
    const el = document.createElementNS(NS, name);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // small utilities
  const fmtDM = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  const fmtD  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  // groupers
  const groupByType = (list) => {
    const m = new Map();
    list.forEach(r=>{
      const t = (r.type || "Unknown");
      m.set(t, (m.get(t)||0)+1);
    });
    return Array.from(m.entries()).map(([k,v])=>({ label:k, value:v }));
  };
  const groupByDay = (list, days=null) => {
    const m = new Map();
    const now = new Date();
    const minTime = days ? now.getTime() - days*86400000 : -Infinity;
    list.forEach(r=>{
      if (!r.createdAt) return;
      const d = new Date(r.createdAt);
      if (d.getTime() < minTime) return;
      const key = fmtD(d);
      m.set(key, (m.get(key)||0) + 1);
    });
    // sort by date asc
    return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([k,v])=>({ label:k, value:v }));
  };
  const groupByMonth = (list) => {
    const m = new Map();
    list.forEach(r=>{
      if (!r.createdAt) return;
      const key = fmtDM(new Date(r.createdAt));
      m.set(key, (m.get(key)||0) + 1);
    });
    return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([k,v])=>({ label:k, value:v }));
  };

  // bar chart
  function barChart({ labels, values, width=720, height=260, title="" }){
    const svg = makeSVG(width, height);
    const m = { top:24, right:16, bottom:36, left:36 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;

    const max = Math.max(1, ...values);
    const bw  = w / Math.max(1, labels.length);
    const g = S("g", { transform:`translate(${m.left},${m.top})` });
    svg.appendChild(g);

    // axes
    g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155", "stroke-width":"1"}));
    g.appendChild(S("line",{ x1:0, y1:0, x2:0, y2:h, stroke:"#334155", "stroke-width":"1"}));

    // bars
    labels.forEach((lb, i)=>{
      const v  = values[i] ?? 0;
      const bh = (v/max) * (h - 8);
      const x  = i*bw + 8;
      const y  = h - bh;
      const rect = S("rect", { x, y, width: Math.max(2,bw-16), height: Math.max(0,bh), rx:6, fill:"#22d3ee", opacity:"0.9" });
      rect.addEventListener("mouseenter", ()=> rect.setAttribute("opacity","1"));
      rect.addEventListener("mouseleave", ()=> rect.setAttribute("opacity","0.9"));
      g.appendChild(rect);

      if (bw >= 36) {
        g.appendChild(S("text", { x: x+(bw-16)/2, y: h+14, "text-anchor":"middle", "font-size":"10", fill:"#94a3b8" },)).appendChild(document.createTextNode(lb));
      }
      if (bh > 14) {
        g.appendChild(S("text",{ x: x+(bw-16)/2, y: y-4, "text-anchor":"middle", "font-size":"11", fill:"#e2e8f0"})).appendChild(document.createTextNode(String(v)));
      }
    });

    // title
    if (title) {
      svg.appendChild(S("text",{ x:m.left, y:18, "font-size":"12", fill:"#94a3b8"})).appendChild(document.createTextNode(title));
    }

    return svg;
  }

  // line chart
  function lineChart({ labels, values, width=720, height=260, title="" }){
    const svg = makeSVG(width, height);
    const m = { top:24, right:16, bottom:36, left:36 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;

    const max = Math.max(1, ...values);
    const step = w / Math.max(1, labels.length-1);
    const g = S("g", { transform:`translate(${m.left},${m.top})` });
    svg.appendChild(g);

    // axes
    g.appendChild(S("line",{ x1:0, y1:h, x2:w, y2:h, stroke:"#334155", "stroke-width":"1"}));
    g.appendChild(S("line",{ x1:0, y1:0, x2:0, y2:h, stroke:"#334155", "stroke-width":"1"}));

    // path
    let d = "";
    labels.forEach((_, i)=>{
      const v = values[i] ?? 0;
      const x = i*step;
      const y = h - (v/max)*(h-8);
      d += (i===0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });
    g.appendChild(S("path",{ d, fill:"none", stroke:"#22d3ee", "stroke-width":"2.25" }));

    // points
    labels.forEach((lb, i)=>{
      const v = values[i] ?? 0;
      const x = i*step;
      const y = h - (v/max)*(h-8);
      const c = S("circle",{ cx:x, cy:y, r:3.5, fill:"#22d3ee" });
      c.addEventListener("mouseenter", ()=> c.setAttribute("r","4.5"));
      c.addEventListener("mouseleave", ()=> c.setAttribute("r","3.5"));
      g.appendChild(c);
      // x labels (sparse)
      const sparse = Math.ceil(labels.length / 8);
      if (i % sparse === 0 || i === labels.length-1) {
        g.appendChild(S("text",{ x, y:h+14, "text-anchor":"middle", "font-size":"10", fill:"#94a3b8"})).appendChild(document.createTextNode(lb));
      }
    });

    // title
    if (title) {
      svg.appendChild(S("text",{ x:m.left, y:18, "font-size":"12", fill:"#94a3b8"})).appendChild(document.createTextNode(title));
    }

    return svg;
  }

  // ---------- PLOT UI ----------
  const plotMetric = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},[
    h("option",{value:"type"},"By Type"),
    h("option",{value:"day"},"By Day"),
    h("option",{value:"month"},"By Month"),
  ]);
  const plotRange = h("select",{class:"bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-sm"},[
    h("option",{value:"7"},"Last 7 days"),
    h("option",{value:"30"},"Last 30 days"),
    h("option",{value:"90"},"Last 90 days"),
    h("option",{value:"all"},"All time"),
  ]);
  // only shown when metric=day
  plotRange.style.display = "inline-block";

  const chartMount = h("div",{class:"mt-3"});
  function redraw(){
    chartMount.innerHTML = "";
    const metric = plotMetric.value;
    if (metric === "type"){
      const data = groupByType(reports);
      const labels = data.map(d=>d.label);
      const values = data.map(d=>d.value);
      chartMount.appendChild(barChart({ labels, values, title:"Reports by Type" }));
      plotRange.style.display = "none";
    } else if (metric === "day"){
      const days = plotRange.value === "all" ? null : Number(plotRange.value);
      const data = groupByDay(reports, days);
      const labels = data.map(d=>d.label);
      const values = data.map(d=>d.value);
      chartMount.appendChild(lineChart({ labels, values, title:`Reports per Day ${days?`(last ${days}d)`: "(all time)"}` }));
      plotRange.style.display = "inline-block";
    } else {
      const data = groupByMonth(reports);
      const labels = data.map(d=>d.label);
      const values = data.map(d=>d.value);
      chartMount.appendChild(barChart({ labels, values, title:"Reports per Month" }));
      plotRange.style.display = "none";
    }
  }
  plotMetric.addEventListener("change", redraw);
  plotRange.addEventListener("change", redraw);

  const plotPanel = panel("Create Plot", h("div",{},[
    h("div",{class:"flex items-center gap-2 mb-2"},[
      h("span",{class:"text-sm text-slate-400"},"Metric:"),
      plotMetric,
      h("span",{class:"text-sm text-slate-400 ml-2"},"Range:"),
      plotRange
    ]),
    chartMount
  ]));

  // initial draw
  redraw();

  // ---------- TABLE + CSV ----------
  const rows = reports.map(r=>({
    ...r,
    createdLocal: r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"
  }));

  const t = table(rows, [
    {label:"ID", key:"id"},
    {label:"Title", key:"title"},
    {label:"Type", key:"type"},
    {label:"Created", key:"createdLocal"},
    {label:"Link", value:r=> r.url ? h("a",{href:r.url, target:"_blank", class:"text-blue-400 underline"},"Open") : "—"}
  ]);

  const exportBtn = h("button",{class:"px-3 py-1 bg-slate-800/70 rounded border border-slate-700 mt-3 hover:bg-slate-700/60 text-sm"},"Export CSV");
  exportBtn.addEventListener("click", ()=>{
    const header = ["ID","Title","Type","Created","URL"];
    const body = reports.map(r=>[ r.id, r.title, r.type, r.createdAt || "", r.url || "" ]);
    const csv = [header, ...body].map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "reports.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  const tablePanel = panel("Reports", h("div",{},[t, exportBtn]));

  // ---------- LAYOUT ----------
  return h("div",{class:"grid gap-6"},[
    plotPanel,
    tablePanel
  ]);
}
