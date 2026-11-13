/* =====================================================================
   EVENTS TEAM PULSE DASHBOARD
   ---------------------------------------------------------------------
   EASY EDIT AREA – change team, queues, colours and score weights here.
   ===================================================================== */
const CONFIG = {
  title: "Events Team",
  members: ["Bala", "Hari", "Jayasree", "Sandhiya", "Sundar", "Subash", "Sivaraj", "Wilfred"],
  categories: ["Funding", "M&A", "CEO", "Leadership", "IPO", "NCP-HP"], // rename "M&A" to "Acquisition" if you prefer
  colors: { turquoise: "#2ABBBB", orange: "#FF6221", magenta: "#B627A1", yellow: "#FFCC01" },
  // Leaderboard score weights (should add up to 100)
  weights: { efficiency: 35, quality: 35, completed: 15, uniqueFeed: 15 },
  storageKey: "teampulse_data_v1",
  // LIVE SYNC (optional): paste your Google Sheet links here so EVERY viewer gets live data.
  // Each value is a Google Sheet tab link (published CSV link, or a normal share link). Leave "" to disable.
  live: { data: "", knowledge: "", operational: "", refreshSeconds: 60 }
};

const C = CONFIG.colors;
const PALETTE = [C.turquoise, C.orange, C.magenta, C.yellow, "#1f8f8f", "#cc4a15", "#8a1d7a", "#d9ad00", "#5fd0d0", "#ff936a"];

/* ---------- Column name aliases (CSV / Excel headers are matched flexibly) ---------- */
const ALIASES = {
  month: ["month", "period"],
  week: ["week", "wk"],
  member: ["member", "employee", "name", "teammember", "analyst"],
  category: ["category", "queue", "task", "feed", "queuename"],
  generated: ["generated", "generatedtasks", "production", "produced", "total", "totaltasks"],
  completed: ["completed", "completedtasks", "done", "completion"],
  rejected: ["rejected", "rejectedtasks", "rejection", "rejects"],
  quality: ["quality", "qualitypercent", "quality%", "qualityscore"],
  efficiency: ["efficiency", "efficiencypercent", "efficiency%", "efficiencyscore"],
  unique: ["uniquefeed", "unique", "uniquefeedcontribution", "uniquecount"]
};
const TEMPLATE_HEADERS = ["Month", "Week", "Member", "Category", "Generated", "Completed", "Rejected", "Quality", "Efficiency", "UniqueFeed"];

/* ---------- State ---------- */
const state = { rows: [], month: "ALL", member: "ALL", view: "overview", charts: {}, live: {}, liveNotes: { knowledge: null, operational: null }, timer: null };

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const num = v => { const n = parseFloat(String(v ?? "").replace(/[%,]/g, "")); return isNaN(n) ? 0 : n; };
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const fmt = (n, d = 1) => (isFinite(n) ? n.toFixed(d) : "0.0");
const int = n => Math.round(n).toLocaleString();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const normKey = k => String(k).toLowerCase().replace(/[^a-z0-9%]/g, "");
const unique = a => [...new Set(a)];

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3500);
}
function monthLabel(m) {
  const x = /^(\d{4})-(\d{2})$/.exec(m);
  if (x) return new Date(+x[1], +x[2] - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
  return m;
}
function sortMonths(list) {
  return [...list].sort((a, b) => {
    const da = Date.parse(a), db = Date.parse(b);
    return (isNaN(da) || isNaN(db)) ? String(a).localeCompare(String(b)) : da - db;
  });
}
function weekNum(w) { const m = /(\d+)/.exec(String(w)); return m ? +m[1] : 0; }
function sortWeeks(list) { return [...list].sort((a, b) => weekNum(a) - weekNum(b)); }

/* ---------- Sample data (demo only – replaced as soon as you upload a file) ---------- */
function generateSample() {
  let seed = 42;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const months = ["2026-09", "2026-10", "2026-11"];
  const skill = [1.05, 0.95, 1.1, 1.0, 0.9, 1.0, 0.97, 1.08];
  const catBase = [60, 35, 25, 30, 20, 45];
  const rows = [];
  months.forEach((month, mi) => {
    for (let w = 1; w <= 4; w++) {
      CONFIG.members.forEach((member, i) => {
        CONFIG.categories.forEach((category, ci) => {
          const gen = Math.round(catBase[ci % catBase.length] * skill[i % skill.length] * (0.85 + rnd() * 0.3) * (1 + mi * 0.04));
          const eff = Math.min(99, 82 + skill[i % skill.length] * 6 + rnd() * 8);
          const comp = Math.round(gen * eff / 100);
          const rej = Math.round(comp * (0.01 + rnd() * 0.05));
          rows.push({
            month, week: "W" + w, member, category,
            generated: gen, completed: comp, rejected: rej,
            quality: +(90 + rnd() * 9.5).toFixed(1),
            efficiency: +eff.toFixed(1),
            unique: Math.round(comp * (0.08 + rnd() * 0.2))
          });
        });
      });
    }
  });
  return rows;
}

/* ---------- Normalise uploaded rows ---------- */
function normalizeRows(raw) {
  const out = [];
  raw.forEach(r => {
    const m = {};
    Object.keys(r).forEach(k => { m[normKey(k)] = r[k]; });
    const pick = f => { for (const a of ALIASES[f]) if (m[a] !== undefined && m[a] !== "") return m[a]; return undefined; };
    const member = pick("member");
    if (!member) return;
    const gen = num(pick("generated")), comp = num(pick("completed")), rej = num(pick("rejected"));
    let q = pick("quality"), e = pick("efficiency");
    out.push({
      month: String(pick("month") ?? "Unknown").trim(),
      week: String(pick("week") ?? "W1").trim(),
      member: String(member).trim(),
      category: String(pick("category") ?? "General").trim(),
      generated: gen, completed: comp, rejected: rej,
      quality: q === undefined ? "" : num(q),
      efficiency: e === undefined ? "" : num(e),
      unique: num(pick("unique"))
    });
  });
  return out;
}

/* ---------- Calculations ---------- */
function rowEff(r) { return r.efficiency !== "" && r.efficiency !== undefined ? num(r.efficiency) : pct(r.completed, r.generated); }
function rowQual(r) { return r.quality !== "" && r.quality !== undefined ? num(r.quality) : pct(r.completed - r.rejected, r.completed); }

function aggregate(rows) {
  const a = { gen: 0, comp: 0, rej: 0, unique: 0, effW: 0, effS: 0, quaW: 0, quaS: 0 };
  rows.forEach(r => {
    a.gen += num(r.generated); a.comp += num(r.completed); a.rej += num(r.rejected); a.unique += num(r.unique);
    const we = num(r.generated) || 1, wq = num(r.completed) || 1;
    a.effS += rowEff(r) * we; a.effW += we;
    a.quaS += rowQual(r) * wq; a.quaW += wq;
  });
  a.eff = a.effW ? a.effS / a.effW : 0;
  a.qual = a.quaW ? a.quaS / a.quaW : 0;
  a.compRate = pct(a.comp, a.gen);
  a.rejRate = pct(a.rej, a.gen);
  return a;
}
function groupBy(rows, key) {
  const m = new Map();
  rows.forEach(r => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}
const allMembers = () => unique([...CONFIG.members, ...state.rows.map(r => r.member)]);
const allCategories = () => unique([...CONFIG.categories, ...state.rows.map(r => r.category)]);
const allMonths = () => sortMonths(unique(state.rows.map(r => r.month)));

const byMonth = rows => state.month === "ALL" ? rows : rows.filter(r => r.month === state.month);
const byMember = rows => state.member === "ALL" ? rows : rows.filter(r => r.member === state.member);
const filtered = () => byMember(byMonth(state.rows));      // month + employee
const monthRows = () => byMonth(state.rows);              // month only (leaderboard / award)

function memberStats(rows) {
  return allMembers().map(name => ({ name, ...aggregate(rows.filter(r => r.member === name)) }));
}
function rank(rows) {
  const stats = memberStats(rows);
  const maxC = Math.max(1, ...stats.map(s => s.comp)), maxU = Math.max(1, ...stats.map(s => s.unique));
  const w = CONFIG.weights;
  stats.forEach(s => {
    s.score = (s.eff * w.efficiency + s.qual * w.quality + (s.comp / maxC) * 100 * w.completed + (s.unique / maxU) * 100 * w.uniqueFeed) / 100;
  });
  stats.sort((a, b) => b.score - a.score);
  stats.forEach((s, i) => s.rank = i + 1);
  return stats;
}

/* ---------- Chart helper ---------- */
function chart(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  const dark = document.documentElement.dataset.theme === "dark";
  const txt = dark ? "#cfe3e8" : "#44545c", grid = dark ? "#243a44" : "#e5ecef";
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
  const o = config.options;
  o.plugins = Object.assign({ legend: { labels: { color: txt } } }, o.plugins || {});
  if (config.type !== "doughnut" && config.type !== "pie") {
    o.scales = o.scales || {};
    ["x", "y"].forEach(ax => {
      o.scales[ax] = Object.assign({ ticks: { color: txt }, grid: { color: grid } }, o.scales[ax] || {});
      if (!o.scales[ax].ticks) o.scales[ax].ticks = { color: txt };
      else o.scales[ax].ticks.color = txt;
    });
  }
  state.charts[id] = new Chart($("#" + id), config);
}
const ds = (label, data, color, extra = {}) => ({ label, data, backgroundColor: color, borderColor: color, borderWidth: 2, ...extra });

/* ---------- Render: filters ---------- */
function renderFilters() {
  const ms = allMonths();
  if (state.month !== "ALL" && !ms.includes(state.month)) state.month = ms[ms.length - 1] || "ALL";
  $("#monthSelect").innerHTML = `<option value="ALL">All months</option>` + ms.map(m => `<option value="${esc(m)}" ${m === state.month ? "selected" : ""}>${esc(monthLabel(m))}</option>`).join("");
  $("#monthSelect").value = state.month;
  $("#memberSelect").innerHTML = `<option value="ALL">All members</option>` + allMembers().map(m => `<option ${m === state.member ? "selected" : ""}>${esc(m)}</option>`).join("");
  $("#memberSelect").value = state.member;
}

/* ---------- Render: overview ---------- */
function renderOverview() {
  const rows = filtered(), t = aggregate(rows);
  const kpis = [
    ["Total Generated Tasks", int(t.gen), "Production", ""],
    ["Total Completed Tasks", int(t.comp), fmt(t.compRate) + "% completion", "c2"],
    ["Total Rejected Tasks", int(t.rej), fmt(t.rejRate) + "% rejection", "c3"],
    ["Overall Efficiency", fmt(t.eff) + "%", "Weighted by production", "c4"],
    ["Overall Quality", fmt(t.qual) + "%", "Weighted by completed", ""],
    ["Unique Feed Contribution", int(t.unique), fmt(pct(t.unique, t.comp)) + "% of completed", "c2"]
  ];
  $("#kpiGrid").innerHTML = kpis.map(k => `<div class="kpi ${k[3]}"><div class="label">${k[0]}</div><div class="value">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join("");

  const stats = memberStats(filtered()).filter(s => state.member === "ALL" || s.name === state.member);
  const names = stats.map(s => s.name);
  chart("chGCR", { type: "bar", data: { labels: names, datasets: [ds("Generated", stats.map(s => s.gen), C.turquoise), ds("Completed", stats.map(s => s.comp), C.orange), ds("Rejected", stats.map(s => s.rej), C.magenta)] } });
  chart("chEQ", { type: "bar", data: { labels: names, datasets: [ds("Efficiency %", stats.map(s => +fmt(s.eff)), C.turquoise), ds("Quality %", stats.map(s => +fmt(s.qual)), C.yellow)] }, options: { scales: { y: { min: 0, max: 100 } } } });
  chart("chProd", { type: "bar", data: { labels: names, datasets: [ds("Completed", stats.map(s => s.comp), names.map((_, i) => PALETTE[i % PALETTE.length]))] }, options: { indexAxis: "y", plugins: { legend: { display: false } } } });
  chart("chUnique", { type: "bar", data: { labels: names, datasets: [ds("Unique Feed", stats.map(s => s.unique), C.magenta)] }, options: { plugins: { legend: { display: false } } } });
  const cats = allCategories();
  const cs = cats.map(c => aggregate(rows.filter(r => r.category === c)));
  chart("chCatDonut", { type: "doughnut", data: { labels: cats, datasets: [{ data: cs.map(s => s.comp), backgroundColor: PALETTE }] }, options: { plugins: { legend: { position: "right", labels: { color: document.documentElement.dataset.theme === "dark" ? "#cfe3e8" : "#44545c" } } } } });
  chart("chRate", { type: "doughnut", data: { labels: ["Completed (net of rejected)", "Rejected", "Pending / Not completed"], datasets: [{ data: [Math.max(0, t.comp - t.rej), t.rej, Math.max(0, t.gen - t.comp)], backgroundColor: [C.turquoise, C.magenta, C.yellow] }] }, options: { plugins: { legend: { position: "right", labels: { color: document.documentElement.dataset.theme === "dark" ? "#cfe3e8" : "#44545c" } } } } });
}

/* ---------- Render: monthly ---------- */
function renderMonthly() {
  const rows = filtered(), cats = allCategories();
  const cs = cats.map(c => aggregate(rows.filter(r => r.category === c)));
  chart("chCat", { type: "bar", data: { labels: cats, datasets: [ds("Generated", cs.map(s => s.gen), C.turquoise), ds("Completed", cs.map(s => s.comp), C.orange), ds("Rejected", cs.map(s => s.rej), C.magenta)] } });

  const ms = allMonths(), base = byMember(state.rows);
  const mt = ms.map(m => aggregate(base.filter(r => r.month === m)));
  chart("chMonthCmp", {
    type: "bar",
    data: { labels: ms.map(monthLabel), datasets: [
      ds("Generated", mt.map(s => s.gen), C.turquoise), ds("Completed", mt.map(s => s.comp), C.orange), ds("Rejected", mt.map(s => s.rej), C.magenta),
      ds("Efficiency %", mt.map(s => +fmt(s.eff)), C.yellow, { type: "line", yAxisID: "y1", tension: .3 }),
      ds("Quality %", mt.map(s => +fmt(s.qual)), "#333", { type: "line", yAxisID: "y1", tension: .3 })
    ] },
    options: { scales: { y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: "#888" } } } }
  });

  // Member x category matrix (completed)
  const members = allMembers().filter(m => state.member === "ALL" || m === state.member);
  const mrows = monthRows();
  let h = `<tr><th>Member</th>${cats.map(c => `<th>${esc(c)}</th>`).join("")}<th>Total</th></tr>`;
  members.forEach(m => {
    const vals = cats.map(c => aggregate(mrows.filter(r => r.member === m && r.category === c)).comp);
    h += `<tr><td><b>${esc(m)}</b></td>${vals.map(v => `<td>${int(v)}</td>`).join("")}<td><b>${int(vals.reduce((a, b) => a + b, 0))}</b></td></tr>`;
  });
  $("#matrixTable").innerHTML = h;

  let ch = `<tr><th>Category</th><th>Generated</th><th>Completed</th><th>Rejected</th><th>Completion %</th><th>Rejection %</th><th>Efficiency %</th><th>Quality %</th><th>Unique Feed</th></tr>`;
  cats.forEach((c, i) => { const s = cs[i]; ch += `<tr><td><b>${esc(c)}</b></td><td>${int(s.gen)}</td><td>${int(s.comp)}</td><td>${int(s.rej)}</td><td>${fmt(s.compRate)}</td><td>${fmt(s.rejRate)}</td><td>${fmt(s.eff)}</td><td>${fmt(s.qual)}</td><td>${int(s.unique)}</td></tr>`; });
  $("#catTable").innerHTML = ch;
}

/* ---------- Render: weekly ---------- */
function renderWeekly() {
  const rows = filtered(), weeks = sortWeeks(unique(rows.map(r => r.week)));
  const ws = weeks.map(w => aggregate(rows.filter(r => r.week === w)));
  chart("chWeekTeam", { type: "line", data: { labels: weeks, datasets: [ds("Generated", ws.map(s => s.gen), C.turquoise, { tension: .3 }), ds("Completed", ws.map(s => s.comp), C.orange, { tension: .3 }), ds("Rejected", ws.map(s => s.rej), C.magenta, { tension: .3 })] } });
  chart("chWeekEQ", { type: "line", data: { labels: weeks, datasets: [ds("Efficiency %", ws.map(s => +fmt(s.eff)), C.turquoise, { tension: .3 }), ds("Quality %", ws.map(s => +fmt(s.qual)), C.yellow, { tension: .3 })] }, options: { scales: { y: { min: 0, max: 100 } } } });
  const members = allMembers().filter(m => state.member === "ALL" || m === state.member);
  chart("chWeekMember", { type: "line", data: { labels: weeks, datasets: members.map((m, i) => ds(m, weeks.map(w => aggregate(rows.filter(r => r.member === m && r.week === w)).comp), PALETTE[i % PALETTE.length], { tension: .3, backgroundColor: "transparent" })) } });
  let h = `<tr><th>Week</th><th>Generated</th><th>Completed</th><th>Rejected</th><th>Efficiency %</th><th>Quality %</th><th>Unique Feed</th></tr>`;
  weeks.forEach((w, i) => { const s = ws[i]; h += `<tr><td><b>${esc(w)}</b></td><td>${int(s.gen)}</td><td>${int(s.comp)}</td><td>${int(s.rej)}</td><td>${fmt(s.eff)}</td><td>${fmt(s.qual)}</td><td>${int(s.unique)}</td></tr>`; });
  $("#weekTable").innerHTML = h;
}

/* ---------- Render: leaderboard ---------- */
function renderLeaderboard() {
  const stats = rank(monthRows()), w = CONFIG.weights;
  $("#scoreNote").textContent = `Score = Efficiency ${w.efficiency}% + Quality ${w.quality}% + Completed ${w.completed}% + Unique Feed ${w.uniqueFeed}% (edit weights in script.js)`;
  let h = `<tr><th>Rank</th><th>Member</th><th>Generated</th><th>Completed</th><th>Rejected</th><th>Efficiency %</th><th>Quality %</th><th>Unique Feed</th><th>Score</th><th></th></tr>`;
  stats.forEach(s => {
    h += `<tr class="${s.name === state.member ? "highlight" : ""}"><td><span class="rank ${s.rank <= 3 ? "r" + s.rank : ""}">${s.rank}</span></td><td><b>${esc(s.name)}</b></td><td>${int(s.gen)}</td><td>${int(s.comp)}</td><td>${int(s.rej)}</td><td>${fmt(s.eff)}</td><td>${fmt(s.qual)}</td><td>${int(s.unique)}</td><td><b>${fmt(s.score)}</b></td><td><div class="bar"><i style="width:${Math.min(100, s.score)}%"></i></div></td></tr>`;
  });
  $("#lbTable").innerHTML = h;
  chart("chScore", { type: "bar", data: { labels: stats.map(s => s.name), datasets: [ds("Score", stats.map(s => +fmt(s.score)), stats.map((_, i) => PALETTE[i % PALETTE.length]))] }, options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } });
}

/* ---------- Render: award ---------- */
function renderAward() {
  const stats = rank(monthRows());
  if (!stats.length || !stats[0].gen) { $("#awardHero").innerHTML = "<h2>No data</h2>"; $("#podium").innerHTML = ""; return; }
  const top = stats[0], label = state.month === "ALL" ? "All Months" : monthLabel(state.month);
  $("#awardHero").innerHTML = `<div class="star">⭐</div><div>TEAM TOPPER · STAR OF THE MONTH · ${esc(label)}</div><h2>${esc(top.name)}</h2>
    <div class="stats"><div><b>${fmt(top.score)}</b>Score</div><div><b>${fmt(top.eff)}%</b>Efficiency</div><div><b>${fmt(top.qual)}%</b>Quality</div><div><b>${int(top.comp)}</b>Completed</div><div><b>${int(top.unique)}</b>Unique Feed</div></div>`;
  const medals = ["🥇", "🥈", "🥉"];
  $("#podium").innerHTML = stats.slice(0, 3).map((s, i) => `<div class="pod p${i + 1}"><div class="medal">${medals[i]}</div><h3 style="justify-content:center">${esc(s.name)}</h3><p>Score <b>${fmt(s.score)}</b></p><p class="muted">Eff ${fmt(s.eff)}% · Qual ${fmt(s.qual)}% · ${int(s.comp)} completed</p></div>`).join("");
}

/* ---------- Editable notes (Knowledge sharing / Operational updates) ---------- */
const NOTE_DEFS = {
  knowledge: {
    table: "#knowledgeTable", key: "teampulse_knowledge_v1",
    cols: [["date", "Date", "date"], ["presenter", "Presenter", "member"], ["topic", "Topic", "text"], ["queue", "Queue", "category"], ["notes", "Key takeaways", "area"]],
    sample: () => [
      { date: "2026-11-05", presenter: "Hari", topic: "Identifying unique funding feeds", queue: "Funding", notes: "How to cross-check duplicates before marking a feed unique." },
      { date: "2026-11-12", presenter: "Jayasree", topic: "CEO change tagging guidelines", queue: "CEO", notes: "Edge cases for interim CEO announcements." }
    ]
  },
  operational: {
    table: "#operationalTable", key: "teampulse_operational_v1",
    cols: [["date", "Date", "date"], ["owner", "Owner", "member"], ["update", "Update", "area"], ["impact", "Impact", "text"], ["status", "Status", "status"]],
    sample: () => [
      { date: "2026-11-03", owner: "Bala", update: "New guideline for NCP-HP queue prioritisation.", impact: "Faster turnaround", status: "Done" },
      { date: "2026-11-10", owner: "Sundar", update: "Tool downtime on IPO queue – raised ticket.", impact: "Medium", status: "In progress" }
    ]
  }
};
function loadNotes(k) {
  const d = NOTE_DEFS[k];
  try { const s = localStorage.getItem(d.key); if (s) return JSON.parse(s); } catch (e) {}
  return d.sample();
}
function saveNotes(k, data) { try { localStorage.setItem(NOTE_DEFS[k].key, JSON.stringify(data)); } catch (e) {} }
function renderNotes(k) {
  const d = NOTE_DEFS[k], isLive = !!state.live[k];
  if (isLive && !state.liveNotes[k]) { $(d.table).innerHTML = `<tr><td class="muted">Loading from Google Sheet…</td></tr>`; return; }
  const data = isLive ? state.liveNotes[k] : loadNotes(k);
  if (isLive) {
    let h = `<tr>${d.cols.map(c => `<th>${c[1]}</th>`).join("")}</tr>`;
    data.forEach(row => { h += `<tr>${d.cols.map(c => `<td style="white-space:normal">${esc(row[c[0]])}</td>`).join("")}</tr>`; });
    const el = $(d.table); el.innerHTML = h; el.onchange = null; el.onclick = null; return;
  }
  const cell = (c, row, i) => {
    const [f, , type] = c, v = row[f] ?? "";
    if (type === "member") return `<select data-i="${i}" data-f="${f}">${allMembers().map(m => `<option ${m === v ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>`;
    if (type === "category") return `<select data-i="${i}" data-f="${f}">${allCategories().map(m => `<option ${m === v ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>`;
    if (type === "status") return `<select data-i="${i}" data-f="${f}">${["Planned", "In progress", "Done", "On hold"].map(m => `<option ${m === v ? "selected" : ""}>${m}</option>`).join("")}</select>`;
    if (type === "area") return `<textarea rows="2" data-i="${i}" data-f="${f}">${esc(v)}</textarea>`;
    return `<input type="${type}" value="${esc(v)}" data-i="${i}" data-f="${f}" />`;
  };
  let h = `<tr>${d.cols.map(c => `<th>${c[1]}</th>`).join("")}<th></th></tr>`;
  data.forEach((row, i) => { h += `<tr>${d.cols.map(c => `<td>${cell(c, row, i)}</td>`).join("")}<td><button class="btn btn-sm btn-danger" data-del="${i}">✕</button></td></tr>`; });
  const el = $(d.table); el.innerHTML = h;
  el.onchange = e => { const t = e.target; if (t.dataset.f === undefined) return; data[+t.dataset.i][t.dataset.f] = t.value; saveNotes(k, data); };
  el.onclick = e => { const b = e.target.closest("[data-del]"); if (!b) return; data.splice(+b.dataset.del, 1); saveNotes(k, data); renderNotes(k); };
}
$$("[data-add]").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.add;
  if (state.live[k]) { toast("Live Google Sheet is connected – add new rows in the sheet itself."); return; }
  const data = loadNotes(k), row = {};
  NOTE_DEFS[k].cols.forEach(c => row[c[0]] = c[2] === "date" ? new Date().toISOString().slice(0, 10) : c[2] === "member" ? CONFIG.members[0] : c[2] === "category" ? CONFIG.categories[0] : c[2] === "status" ? "Planned" : "");
  data.push(row); saveNotes(k, data); renderNotes(k);
}));

/* ---------- Data editor ---------- */
const DATA_COLS = [["month", "Month", "text"], ["week", "Week", "text"], ["member", "Member", "member"], ["category", "Category", "category"], ["generated", "Generated", "number"], ["completed", "Completed", "number"], ["rejected", "Rejected", "number"], ["quality", "Quality %", "number"], ["efficiency", "Efficiency %", "number"], ["unique", "Unique Feed", "number"]];
let editTimer;
function renderData() {
  const rows = filtered(), ro = !!state.live.data;
  $("#addRowBtn").style.display = $("#resetBtn").style.display = ro ? "none" : "";
  $("#dataNote").textContent = ro ? "Live Google Sheet is connected – this table is read-only. Edit the numbers in your Google Sheet and they appear here automatically." : "Edit production numbers directly (filtered by the Month / Employee selectors above). Efficiency & Quality left blank are calculated automatically.";
  if (ro) {
    let t = `<tr>${DATA_COLS.map(c => `<th>${c[1]}</th>`).join("")}</tr>`;
    rows.forEach(r => { t += `<tr>${DATA_COLS.map(([f]) => `<td>${esc(r[f])}</td>`).join("")}</tr>`; });
    $("#dataTable").innerHTML = t; return;
  }
  const opts = (list, v) => list.map(m => `<option ${m === v ? "selected" : ""}>${esc(m)}</option>`).join("");
  let h = `<tr>${DATA_COLS.map(c => `<th>${c[1]}</th>`).join("")}<th></th></tr>`;
  rows.forEach(r => {
    const idx = state.rows.indexOf(r);
    h += `<tr>${DATA_COLS.map(([f, , t]) => {
      if (t === "member") return `<td><select data-idx="${idx}" data-f="${f}">${opts(allMembers(), r[f])}</select></td>`;
      if (t === "category") return `<td><select data-idx="${idx}" data-f="${f}">${opts(allCategories(), r[f])}</select></td>`;
      return `<td><input type="${t}" step="any" value="${esc(r[f])}" data-idx="${idx}" data-f="${f}" /></td>`;
    }).join("")}<td><button class="btn btn-sm btn-danger" data-delrow="${idx}">✕</button></td></tr>`;
  });
  $("#dataTable").innerHTML = h;
}
$("#dataTable").addEventListener("input", e => {
  const t = e.target; if (t.dataset.idx === undefined) return;
  const f = t.dataset.f, numeric = ["generated", "completed", "rejected", "quality", "efficiency", "unique"].includes(f);
  state.rows[+t.dataset.idx][f] = numeric ? (t.value === "" ? "" : num(t.value)) : t.value;
  clearTimeout(editTimer); editTimer = setTimeout(() => { persist(); renderAll(["data"]); }, 400);
});
$("#dataTable").addEventListener("change", e => { if (e.target.tagName === "SELECT" && e.target.dataset.idx !== undefined) { state.rows[+e.target.dataset.idx][e.target.dataset.f] = e.target.value; persist(); renderAll(["data"]); } });
$("#dataTable").addEventListener("click", e => { const b = e.target.closest("[data-delrow]"); if (!b) return; state.rows.splice(+b.dataset.delrow, 1); persist(); renderAll(); });
$("#addRowBtn").addEventListener("click", () => {
  state.rows.unshift({ month: state.month === "ALL" ? (allMonths().pop() || "2026-11") : state.month, week: "W1", member: state.member === "ALL" ? CONFIG.members[0] : state.member, category: CONFIG.categories[0], generated: 0, completed: 0, rejected: 0, quality: "", efficiency: "", unique: 0 });
  persist(); renderAll();
});
$("#resetBtn").addEventListener("click", () => { if (confirm("Replace all data with the demo sample data?")) { state.rows = generateSample(); persist(); renderAll(); toast("Sample data restored."); } });

/* ---------- Persistence ---------- */
function persist() { try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.rows)); } catch (e) { toast("Browser storage full – export your data to Excel to keep it."); } }
function restore() {
  try { const s = localStorage.getItem(CONFIG.storageKey); if (s) { const r = JSON.parse(s); if (Array.isArray(r) && r.length) return r; } } catch (e) {}
  return generateSample();
}

/* ---------- Upload ---------- */
function handleFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const finish = raw => {
    const rows = normalizeRows(raw);
    if (!rows.length) { toast("No valid rows found. Needed columns: " + TEMPLATE_HEADERS.join(", ")); return; }
    state.rows = rows; state.month = "ALL"; state.member = "ALL";
    persist(); renderAll(); toast(`Loaded ${rows.length} rows from ${file.name}. All figures recalculated.`);
  };
  if (ext === "csv") {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => finish(res.data), error: () => toast("Could not read the CSV file.") });
  } else {
    const fr = new FileReader();
    fr.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheetName = wb.SheetNames.find(n => /data|production|raw/i.test(n)) || wb.SheetNames[0];
        finish(XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false }));
      } catch (err) { toast("Could not read the Excel file."); }
    };
    fr.readAsArrayBuffer(file);
  }
}
$("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; });

/* ---------- Export ---------- */
function exportExcel() {
  const rows = filtered(), t = aggregate(rows), wb = XLSX.utils.book_new();
  const label = state.month === "ALL" ? "All" : state.month;
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aoa), name);
  add("Summary", [{ Month: label, Employee: state.member, Generated: t.gen, Completed: t.comp, Rejected: t.rej, "Completion %": +fmt(t.compRate), "Rejection %": +fmt(t.rejRate), "Efficiency %": +fmt(t.eff), "Quality %": +fmt(t.qual), "Unique Feed": t.unique }]);
  add("Leaderboard", rank(monthRows()).map(s => ({ Rank: s.rank, Member: s.name, Generated: s.gen, Completed: s.comp, Rejected: s.rej, "Efficiency %": +fmt(s.eff), "Quality %": +fmt(s.qual), "Unique Feed": s.unique, Score: +fmt(s.score) })));
  add("Categories", allCategories().map(c => { const s = aggregate(rows.filter(r => r.category === c)); return { Category: c, Generated: s.gen, Completed: s.comp, Rejected: s.rej, "Efficiency %": +fmt(s.eff), "Quality %": +fmt(s.qual), "Unique Feed": s.unique }; }));
  add("Weekly", sortWeeks(unique(rows.map(r => r.week))).map(w => { const s = aggregate(rows.filter(r => r.week === w)); return { Week: w, Generated: s.gen, Completed: s.comp, Rejected: s.rej, "Efficiency %": +fmt(s.eff), "Quality %": +fmt(s.qual), "Unique Feed": s.unique }; }));
  add("Monthly Comparison", allMonths().map(m => { const s = aggregate(byMember(state.rows).filter(r => r.month === m)); return { Month: m, Generated: s.gen, Completed: s.comp, Rejected: s.rej, "Efficiency %": +fmt(s.eff), "Quality %": +fmt(s.qual), "Unique Feed": s.unique }; }));
  add("Raw Data", rows.map(r => ({ Month: r.month, Week: r.week, Member: r.member, Category: r.category, Generated: r.generated, Completed: r.completed, Rejected: r.rejected, Quality: rowQual(r), Efficiency: rowEff(r), UniqueFeed: r.unique })));
  XLSX.writeFile(wb, `Team_Performance_${label}.xlsx`);
  toast("Excel report exported.");
}
$("#exportBtn").addEventListener("click", exportExcel);
$("#templateBtn").addEventListener("click", () => {
  const sample = generateSample().filter(r => r.month === "2026-11" && r.week === "W1").map(r => ({ Month: r.month, Week: r.week, Member: r.member, Category: r.category, Generated: r.generated, Completed: r.completed, Rejected: r.rejected, Quality: r.quality, Efficiency: r.efficiency, UniqueFeed: r.unique }));
  const csv = Papa.unparse(sample, { columns: TEMPLATE_HEADERS });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "team-data-template.csv"; a.click();
  toast("Template downloaded – paste your Google Sheet data in this format and upload it.");
});

/* ---------- Navigation, theme, filters ---------- */
const TITLES = { overview: "Main Dashboard", monthly: "Monthly Deliverable", weekly: "Weekly Trend", leaderboard: "Individual Performance Leaderboard", knowledge: "Team's Knowledge Sharing", operational: "Operational Updates of the Month", award: "Team Topper · Star of the Month", data: "Data Editor" };
const RENDER = { overview: renderOverview, monthly: renderMonthly, weekly: renderWeekly, leaderboard: renderLeaderboard, award: renderAward, data: renderData, knowledge: () => renderNotes("knowledge"), operational: () => renderNotes("operational") };
function renderAll(skip = []) { renderFilters(); if (!skip.includes(state.view)) RENDER[state.view](); else { renderFilters(); /* keep focus in data editor */ } }
function showView(v) {
  state.view = v;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach(s => s.classList.toggle("active", s.id === "view-" + v));
  $("#viewTitle").textContent = TITLES[v];
  location.hash = v; RENDER[v]();
}
$$(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$("#monthSelect").addEventListener("change", e => { state.month = e.target.value; RENDER[state.view](); });
$("#memberSelect").addEventListener("change", e => { state.member = e.target.value; RENDER[state.view](); });
$("#themeBtn").addEventListener("click", () => {
  const d = document.documentElement, next = d.dataset.theme === "dark" ? "light" : "dark";
  d.dataset.theme = next; try { localStorage.setItem("teampulse_theme", next); } catch (e) {}
  RENDER[state.view]();
});

/* ---------- LIVE SYNC (Google Sheets) ---------- */
const LIVE_KEY = "teampulse_live_v1";
function loadLive() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(LIVE_KEY) || "{}"); } catch (e) {}
  const L = CONFIG.live;
  return { data: s.data ?? L.data, knowledge: s.knowledge ?? L.knowledge, operational: s.operational ?? L.operational, refresh: +(s.refresh ?? L.refreshSeconds) || 60 };
}
// Accepts a "Publish to web" CSV link OR a normal Google Sheet link (with ?gid=TAB_ID)
function csvUrl(u) {
  u = (u || "").trim(); if (!u) return "";
  const m = /spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(u);
  if (m && !/output=csv|tqx=out:csv/.test(u)) { const g = /[?#&]gid=(\d+)/.exec(u); return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${g ? "&gid=" + g[1] : ""}`; }
  return u;
}
async function fetchCsv(url) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return Papa.parse(await res.text(), { header: true, skipEmptyLines: true }).data;
}
function normalizeNotes(k, raw) {
  const cols = NOTE_DEFS[k].cols, out = [];
  raw.forEach(r => {
    const m = {}; Object.keys(r).forEach(h => { m[normKey(h)] = r[h]; });
    const row = {}; cols.forEach(([f, label]) => { row[f] = String(m[normKey(f)] ?? m[normKey(label)] ?? "").trim(); });
    if (Object.values(row).some(v => v)) out.push(row);
  });
  return out;
}
function setStatus(ok) {
  const el = $("#liveStatus"), any = state.live.data || state.live.knowledge || state.live.operational;
  if (!any) { el.textContent = "Local data"; el.className = "pill"; return; }
  if (ok) { el.textContent = "● Live · " + new Date().toLocaleTimeString(); el.className = "pill ok"; }
  else { el.textContent = "⚠ Sync failed"; el.className = "pill bad"; }
}
async function syncNow(manual) {
  const L = state.live; if (!(L.data || L.knowledge || L.operational)) { setStatus(); return; }
  let changed = false;
  try {
    if (L.data) {
      const rows = normalizeRows(await fetchCsv(csvUrl(L.data)));
      if (!rows.length) throw new Error("No valid rows in the data sheet");
      if (JSON.stringify(rows) !== JSON.stringify(state.rows)) { state.rows = rows; persist(); changed = true; }
    }
    for (const k of ["knowledge", "operational"]) {
      if (!L[k]) continue;
      const rows = normalizeNotes(k, await fetchCsv(csvUrl(L[k])));
      if (JSON.stringify(rows) !== JSON.stringify(state.liveNotes[k])) { state.liveNotes[k] = rows; changed = true; }
    }
    setStatus(true);
    if (changed || manual) renderAll();
    if (manual) toast("Synced with Google Sheet.");
  } catch (e) {
    setStatus(false);
    if (manual) toast("Could not read the Google Sheet. Make sure the tab is published to the web (File → Share → Publish to web → CSV) or shared as 'Anyone with the link'.");
  }
}
function scheduleSync() {
  clearInterval(state.timer);
  if (state.live.data || state.live.knowledge || state.live.operational) state.timer = setInterval(() => syncNow(false), Math.max(15, state.live.refresh) * 1000);
}
$("#liveBtn").addEventListener("click", () => {
  const p = $("#syncPanel"); p.hidden = !p.hidden;
  $("#liveData").value = state.live.data || ""; $("#liveKnowledge").value = state.live.knowledge || ""; $("#liveOperational").value = state.live.operational || ""; $("#liveRefresh").value = state.live.refresh;
});
$("#liveSave").addEventListener("click", () => {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ data: $("#liveData").value.trim(), knowledge: $("#liveKnowledge").value.trim(), operational: $("#liveOperational").value.trim(), refresh: +$("#liveRefresh").value || 60 })); } catch (e) {}
  state.live = loadLive(); state.liveNotes = { knowledge: null, operational: null };
  scheduleSync(); renderAll(); syncNow(true);
});
$("#liveOff").addEventListener("click", () => {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ data: "", knowledge: "", operational: "", refresh: 60 })); } catch (e) {}
  state.live = loadLive(); state.liveNotes = { knowledge: null, operational: null };
  scheduleSync(); setStatus(); renderAll(); toast("Live sync disconnected. Showing local data.");
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(false); });

/* ---------- Init ---------- */
(function init() {
  $("#brandTitle").textContent = CONFIG.title;
  state.live = loadLive();
  try { const t = localStorage.getItem("teampulse_theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  state.rows = restore();
  const ms = allMonths(); state.month = ms[ms.length - 1] || "ALL";
  const start = location.hash.replace("#", "");
  renderFilters();
  showView(RENDER[start] ? start : "overview");
  setStatus(); scheduleSync(); syncNow(false);
})();
