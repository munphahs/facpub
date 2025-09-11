import React, { useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Brush,
  PieChart, Pie, Cell, LabelList,
  ComposedChart, Scatter
} from "recharts";
import YearMonthPicker from "./YearMonthPicker";
import { inferTopic } from "./topicRules";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* ------------------------------ Constants ------------------------------ */
const COMPACT_BAR_HEIGHT   = 250;
const COMPACT_DONUT_HEIGHT = 170;
const COMPACT_BAR_SIZE     = 10;

const COLOR_GRID  = "#e5e7eb";
const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_COLORS = ["#6366F1","#10B981","#F59E0B","#EF4444","#3B82F6","#8B5CF6","#22C55E","#EAB308","#F97316","#06B6D4","#84CC16","#F43F5E"];
const UNSPECIFIED = "Unspecified";
const MIN_YEAR = 2003;

/* ------------------------------ Utils ------------------------------ */
const isNum   = (n) => Number.isFinite(n);
const shorten = (s = "", n = 22) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const BASE    = (import.meta?.env?.BASE_URL ?? "/");
const withBase = (p) => BASE + String(p || "").replace(/^\/+/, "");

async function tryFetchJson(relPath) {
  const url = withBase(relPath);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } catch (e) { console.error("[tryFetchJson] Failed", e); return null; }
}

/* ---------- string normalizers ---------- */
const squashSpaces = (s="") => String(s).replace(/\s+/g, " ").trim();
const normalizeDashesQuotes = (s="") =>
  s.replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
const cleanText = (s="") => squashSpaces(normalizeDashesQuotes(String(s)));

/* ---------- parsing helpers ---------- */
const _splitByConj = (s) =>
  cleanText(s)
    .replace(/\bet\s*al\.?$/i, "")
    .split(/;|,|\||\/|\s+and\s+|\s*&\s*|—|–|:|\s{2,}/i)
    .map(x => squashSpaces(x))
    .filter(Boolean);

const _nameFromObj = (o) => {
  if (!o || typeof o !== "object") return "";
  const parts = [o.given || o.first, o.family || o.last].map(cleanText).filter(Boolean).join(" ");
  return cleanText(o.name || o.fullName || o.displayName || o.value || parts);
};
const _subjectFromObj = (o) =>
  !o || typeof o !== "object" ? "" : cleanText(o.subject || o.name || o.label || o.value || "");

const dedupeCI = (arr) => {
  const seen = new Set(); const out = [];
  for (const x of arr) { const k = x.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
};

const collectAuthors = (r) => {
  const candidates = [
    r.authors, r.author, r.creators, r.creator, r.contributors, r.contributor,
    r["dc.creator"], r["dc.contributor"], r.creatorNames, r.Author, r.Authors
  ].filter(v => v != null);

  const out = [];
  for (const v of candidates) {
    if (typeof v === "string") out.push(..._splitByConj(v));
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(..._splitByConj(item));
        else if (item && typeof item === "object") {
          const n = _nameFromObj(item); if (n) out.push(..._splitByConj(n));
        }
      }
    } else if (v && typeof v === "object") {
      const n = _nameFromObj(v); if (n) out.push(..._splitByConj(n));
    }
  }
  return dedupeCI(out.map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean));
};

const normalizeSubject = (s) => cleanText(s).replace(/[.;,:]$/, "");
const collectSubjects = (r) => {
  const fields = [
    r.subject, r.subjects, r["dc.subject"], r["dc.subjects"],
    r.keywords, r.keyword, r.tags, r.tag, r.discipline, r.disciplines
  ].filter(v => v != null);

  const out = [];
  for (const v of fields) {
    if (typeof v === "string") out.push(..._splitByConj(v));
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(..._splitByConj(item));
        else if (item && typeof item === "object") {
          const s = _subjectFromObj(item); if (s) out.push(..._splitByConj(s));
        }
      }
    } else if (v && typeof v === "object") {
      const s = _subjectFromObj(v); if (s) out.push(..._splitByConj(s));
    }
  }
  return dedupeCI(out.map(x => normalizeSubject(x)).filter(Boolean));
};

/* ---------- title/venue/author fixer ---------- */
const looksLikeAuthorList = (s) => {
  const str = cleanText(s); if (!str) return false;
  const parts = str.split(/\s*,\s*/).filter(Boolean);
  if (parts.length < 2) return false;
  let signal = 0;
  for (const p of parts) if (/^[A-Z][a-zA-Z'’\-]+(?:\s+[A-Z]{1,3}\.?)?$/.test(p)) signal++;
  return signal >= Math.max(2, Math.floor(parts.length * 0.6));
};

function fixTitleAndAuthors(rawTitle = "", rawVenue = "", authors = []) {
  let title = cleanText(rawTitle), venue = cleanText(rawVenue), outAuthors = [...authors];
  const venueLooksLikeTitle = venue.length > 12 && /[a-z]{3,}/.test(venue);
  if ((!outAuthors.length) && looksLikeAuthorList(title)) {
    outAuthors = _splitByConj(title);
    if (venueLooksLikeTitle) { title = venue; venue = ""; }
  }
  return { title, venue, authors: outAuthors };
}

/* ------------------------------ Tooltips ------------------------------ */
const TipCard = ({ title, count }) => (
  <div className="card tip" style={{ padding: 8, fontSize: 10 }}>
    <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
    <div>{count} publications</div>
  </div>
);

const SubjectTooltip = ({ active, payload }) =>
  (active && payload?.length)
    ? <TipCard title={payload.at(-1)?.payload?.subject ?? ""} count={payload.at(-1)?.value ?? 0} />
    : null;

const AuthorTooltip  = ({ active, payload }) =>
  (active && payload?.length)
    ? <TipCard title={payload.at(-1)?.payload?.author || ""} count={payload.at(-1)?.value ?? 0} />
    : null;

/* ===================================================================== */
/*                                MAIN                                    */
/* ===================================================================== */
export default function FacultyPubsDashboard() {
  /* ------------------------------ State ------------------------------ */
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // filters
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.toLowerCase());
  const [yearSel,  setYearSel]  = useState(null);  // exact year
  const [monthSel, setMonthSel] = useState(null);
  const [authorSel, setAuthorSel] = useState("");
  const [subjectSel, setSubjectSel] = useState("");
  const [topicSel, setTopicSel] = useState("");

  // range via Brush (inclusive)
  const [yearRange, setYearRange] = useState(null);

  // table paging
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => { setPage(0); }, [dq, yearSel, monthSel, authorSel, subjectSel, topicSel, yearRange]);

  /* ------------------------------ Load ------------------------------ */
  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      const json = await tryFetchJson("data/faculty_pubs.json");
      if (!json) { setError("Could not load /data/faculty_pubs.json"); setRows([]); setLoading(false); return; }

      const cleaned = (Array.isArray(json) ? json : [])
        .map((r, i) => {
          const type   = cleanText(r.type || "");
          const format = cleanText(r.format || "");
          let authors  = collectAuthors(r);
          const fixed  = fixTitleAndAuthors(r.title || "", r.venue || "", authors);
          authors      = fixed.authors;
          const title  = fixed.title;
          const venue  = fixed.venue;

          const subjects = collectSubjects(r);
          const topic    = inferTopic([title, venue, subjects.join(" ")].filter(Boolean).join(" "));

          const toInt = (n, lo, hi) => {
            const v = parseInt(n, 10);
            if (!Number.isFinite(v)) return null;
            if (lo != null && v < lo) return null;
            if (hi != null && v > hi) return null;
            return v;
          };

          const year  = toInt(r.year, MIN_YEAR, 3000);
          const month = toInt(r.month, 1, 12);
          const url   = cleanText(r.url || "");

          const id = String(r.id || `${year || "x"}-${title}-${i}`)
            .normalize("NFKD").replace(/[^\w\-]+/g, "-").slice(0, 160);

          return {
            id, title, venue, type, format, authors, subjects, topic, year, month, url,
            lcTitle: title.toLowerCase(),
            lcVenue: venue.toLowerCase(),
            lcSubjects: subjects.map(s => s.toLowerCase()),
            lcAuthors: authors.map(a => a.toLowerCase())
          };
        })
        .filter(r => r.title);

      setRows(cleaned);
      setLoading(false);
    })();
  }, []);

  /* ------------------------------ Derived: filtering ------------------------------ */
  const filtered = useMemo(() => {
    const query = dq.trim();
    return rows.filter(r => {
      const inExactYear = !yearSel || r.year === yearSel;

      const inRange = !yearRange || (
        isNum(r.year) && r.year >= yearRange.from && r.year <= yearRange.to
      );

      const inMonth   = !monthSel   || r.month === monthSel;
      const inAuthor  = !authorSel  || (r.authors || []).includes(authorSel);
      const subs      = r.subjects?.length ? r.subjects : [UNSPECIFIED];
      const inSubject = !subjectSel || subs.includes(subjectSel);
      const inTopic   = !topicSel   || (r.topic || "Other") === topicSel;

      const inQuery = !query
        || r.lcTitle.includes(query)
        || r.lcVenue.includes(query)
        || r.lcSubjects.some(s => s.includes(query))
        || r.lcAuthors.some(a => a.includes(query));

      return inExactYear && inRange && inMonth && inAuthor && inSubject && inTopic && inQuery;
    });
  }, [rows, dq, yearSel, yearRange, monthSel, authorSel, subjectSel, topicSel]);

  /* ------------------------------ Paging ------------------------------ */
  const totalRows  = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const startIndex = page * PAGE_SIZE;
  const endIndex   = Math.min(startIndex + PAGE_SIZE, totalRows);
  const tableRows  = filtered.slice(startIndex, endIndex);

  /* ------------------------------ Charts data ------------------------------ */
  // Build year histogram from ALL rows so the brush shows the full extent
  const byYear = useMemo(() => {
    const counts = new Map();
    for (const r of rows) if (isNum(r.year)) counts.set(r.year, (counts.get(r.year) || 0) + 1);

    // determine min/max with clamp at MIN_YEAR and with at least 2 ticks
    const years = [...counts.keys()];
    const minY = Math.max(MIN_YEAR, years.length ? Math.min(...years) : new Date().getFullYear() - 1);
    const maxY = years.length ? Math.max(...years) : new Date().getFullYear();
    const out = [];
    for (let y = minY; y <= maxY; y++) out.push({ year: y, count: counts.get(y) ?? 0 });
    if (out.length === 1) out.push({ year: out[0].year + 1, count: 0 });
    return out;
  }, [rows]);

  const byMonth = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, label: MONTHS[i], count: 0 }));
    for (const r of filtered) if (isNum(r.month)) base[r.month - 1].count += 1;
    return base;
  }, [filtered]);

  const bySubjectRaw = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const subs = r.subjects?.length ? r.subjects : [UNSPECIFIED];
      for (const s of subs) {
        const k = normalizeSubject(s); if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    return Array.from(map, ([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
  }, [filtered]);

  const bySubject = useMemo(
    () => bySubjectRaw.filter(x => x.subject !== UNSPECIFIED).slice(0, 12),
    [bySubjectRaw]
  );

  const byTopic = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const k = r.topic || "Other";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map, ([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 12);
  }, [filtered]);

  const showTopicsInstead = bySubject.length === 0;

  const topAuthors = useMemo(() => {
    const src = filtered.length ? filtered : rows;
    const map = new Map();
    for (const r of src) for (const a of (r.authors || [])) {
      const k = a.replace(/\s+/g, " ").trim(); if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map, ([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
      .slice(0, 10);
  }, [filtered, rows]);

  const kpi = {
    total: filtered.length,
    years: (() => {
      const ys = filtered.map(r => r.year).filter(isNum).sort((a,b)=>a-b);
      return ys.length ? `${ys[0]}–${ys[ys.length-1]}` : "—";
    })(),
    venues: new Set(filtered.map(r => r.venue).filter(Boolean)).size,
    authors: new Set(filtered.flatMap(r => r.authors || [])).size,
  };

  /* ------------------------------ PDF export ------------------------------ */
  const captureRef = useRef(null);
  async function handleExportPDF() {
    if (!captureRef.current) return;
    captureRef.current.classList.add("exporting");
    await new Promise(r => setTimeout(r, 250));

    const node = captureRef.current;
    const canvas = await html2canvas(node, {
      backgroundColor: "#ffffff",
      scale: window.devicePixelRatio < 2 ? 2 : window.devicePixelRatio,
      useCORS: true,
      logging: false
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
    } else {
      let srcY = 0;
      const sliceHpx = Math.floor((canvas.width * pageH) / pageW);
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = sliceHpx;
      const ctx = tmp.getContext("2d");
      let first = true;
      while (srcY < canvas.height) {
        ctx.clearRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, srcY, tmp.width, sliceHpx, 0, 0, tmp.width, sliceHpx);
        const slice = tmp.toDataURL("image/png");
        if (!first) pdf.addPage();
        pdf.addImage(slice, "PNG", 0, 0, imgW, pageH);
        first = false;
        srcY += sliceHpx;
      }
    }
    captureRef.current.classList.remove("exporting");
    pdf.save("faculty-publications-dashboard.pdf");
  }

  /* ------------------------------ Brush helpers ------------------------------ */
  const brushDefaults = useMemo(() => {
    if (!byYear.length) return { startIndex: 0, endIndex: 0 };
    // If a range is active, place the thumbs to match it; else full extent
    const firstYear = yearRange?.from ?? byYear[0].year;
    const lastYear  = yearRange?.to   ?? byYear[byYear.length - 1].year;
    const si = Math.max(0, byYear.findIndex(d => d.year === firstYear));
    const ei = Math.max(0, byYear.findIndex(d => d.year === lastYear));
    return {
      startIndex: si === -1 ? 0 : si,
      endIndex:   ei === -1 ? byYear.length - 1 : ei
    };
  }, [byYear, yearRange]);

  /* ------------------------------ UI ------------------------------ */
  return (
    <div ref={captureRef} className="wrap pretty" style={{ maxWidth: "1500px", margin: "12px auto", padding: "0 8px" }}>
      {/* Header/KPIs */}
      <div className="hero compact">
        <div className="hero-left" style={{ display:"flex", alignItems:"center", gap:20 }}>
          <img src={withBase("mun-logo.png")} alt="Logo" className="logo" />
          <div className="title-block">
            <h2 style={{ margin: 0, fontSize: 20, opacity: .8 }}>
              Faculty of Medicine | Division of Population Health and Applied Health Sciences
            </h2>
            <h1 style={{ margin: 0, fontSize: 25, opacity: .8 }}>Faculty Publication Dashboard</h1>
          </div>
        </div>

        <div className="kpis-and-actions" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button className="btn export" onClick={handleExportPDF} aria-label="Download dashboard as PDF">⬇︎ Download PDF</button>
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-value">{kpi.total}</div></div>
            <div className="kpi"><div className="kpi-label">Year span</div><div className="kpi-value">{kpi.years}</div></div>
            <div className="kpi"><div className="kpi-label">Venues</div><div className="kpi-value">{kpi.venues}</div></div>
            <div className="kpi"><div className="kpi-label">Authors</div><div className="kpi-value">{kpi.authors}</div></div>
          </div>
        </div>
      </div>

      {/* 2-column layout: charts left, table right */}
      <div className="two-col">
        {/* LEFT: filters + charts */}
        <div className="left-stack">
          {/* Combined filter row */}
          <div className="filters-row card">
            <div className="filter-combined">
              {/* Search */}
              <div className="input-wrap">
                <span style={{opacity:.6}}>🔎</span>
                <input
                  className="input"
                  placeholder="Title, author, subject…"
                  value={q}
                  onChange={(e)=>setQ(e.target.value)}
                  aria-label="Search publications"
                />
              </div>
              {/* Year & Month */}
              <div className="ymp-compact">
                <YearMonthPicker
                  valueYear={yearSel}
                  valueMonth={monthSel}
                  onChange={(y, m) => {
                    setYearSel(y);
                    setMonthSel(m);
                    setYearRange(null); // picking an exact date clears range
                  }}
                  minYear={MIN_YEAR}
                  maxYear={new Date().getFullYear()}
                />
              </div>
            </div>

            {(yearSel || monthSel || authorSel || subjectSel || topicSel || dq || yearRange) && (
              <div className="filter-item chips-block">
                <div className="hd small">Active Filters</div>
                <div className="chips tight">
                  {yearSel   && <button className="chip" onClick={()=> setYearSel(null)}>Year: {yearSel} ✕</button>}
                  {yearRange && (
                    <button className="chip" onClick={()=> setYearRange(null)}>
                      Years: {yearRange.from}–{yearRange.to} ✕
                    </button>
                  )}
                  {monthSel  && <button className="chip" onClick={()=> setMonthSel(null)}>Month: {MONTHS[monthSel-1]} ✕</button>}
                  {authorSel && <button className="chip" onClick={()=> setAuthorSel("")}>Author: {authorSel} ✕</button>}
                  {subjectSel&& <button className="chip" onClick={()=> setSubjectSel("")}>Subject: {shorten(subjectSel,20)} ✕</button>}
                  {topicSel  && <button className="chip" onClick={()=> setTopicSel("")}>Topic: {shorten(topicSel,20)} ✕</button>}
                  {dq && <button className="chip" onClick={()=> setQ("")}>Search ✕</button>}
                  <button className="chip" onClick={()=>{
                    setYearSel(null); setYearRange(null); setMonthSel(null);
                    setAuthorSel(""); setSubjectSel(""); setTopicSel(""); setQ("");
                  }}>Clear all ✕</button>
                </div>
              </div>
            )}
          </div>

          {/* Row 1: Year + Month */}
          <div className="grid-row top">
            <div className="card chart-card year-card">
              <h3 className="tight">Publications</h3>
              <ResponsiveContainer width="100%" height={COMPACT_BAR_HEIGHT}>
                <BarChart data={byYear} margin={{ top: 2, right: 8, left: 4, bottom: 6 }} barSize={COMPACT_BAR_SIZE} barCategoryGap={10}>
                  <defs>
                    <linearGradient id="yearBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5cc5f6" />
                      <stop offset="100%" stopColor="#7044f5" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={COLOR_GRID} />
                  <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} tickMargin={4} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Publications"
                    radius={[3,3,0,0]}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={({ payload }) => {
                      const y = Number(payload?.year);
                      if (isNum(y)) {
                        setYearSel(prev => (prev === y ? null : y));
                        setYearRange(null); // single year overrides range
                      }
                    }}
                  >
                    {byYear.map((d, i) => (
                      <Cell key={`y-${i}`} fill={yearSel === d.year ? "#7c3aed" : "url(#yearBar)"} />
                    ))}
                  </Bar>

                  {byYear.length > 2 && (
                    <Brush
                      dataKey="year"
                      height={20}
                      travellerWidth={8}
                      stroke="#9ca3af"
                      fill="#eef2f7"
                      startIndex={brushDefaults.startIndex}
                      endIndex={brushDefaults.endIndex}
                      onChange={(rng) => {
                        if (!rng) return;
                        const si = Math.max(0, Math.min(byYear.length - 1, rng.startIndex ?? 0));
                        const ei = Math.max(0, Math.min(byYear.length - 1, rng.endIndex   ?? byYear.length - 1));
                        const from = byYear[Math.min(si, ei)]?.year;
                        const to   = byYear[Math.max(si, ei)]?.year;
                        if (isNum(from) && isNum(to)) {
                          setYearRange({ from, to });
                          setYearSel(null);
                        }
                      }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card chart-card donut-card">
              <h3 className="tight">By Month</h3>
              <div className="donut-wrap">
                <ResponsiveContainer width="80%" height={COMPACT_DONUT_HEIGHT}>
                  <PieChart>
                    <Pie
                      data={byMonth}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                      labelLine={false}
                      label={false}
                      onClick={(e) => {
                        const m = Number(e?.payload?.m);
                        if (m) setMonthSel(prev => (prev === m ? null : m));
                      }}
                    >
                      {byMonth.map((_, i) => (
                        <Cell
                          key={`mcell-${i}`}
                          fill={MONTH_COLORS[i % MONTH_COLORS.length]}
                          stroke={monthSel === i + 1 ? "#111827" : undefined}
                          strokeWidth={monthSel === i + 1 ? 1.5 : 0}
                          cursor="pointer"
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, _n, ctx) => [`${v} pubs`, ctx?.payload?.label ?? "Month"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Subject/Topic + Authors */}
          <div className="grid-row">
            <div className="card chart-card subject-card">
              <h3 className="tight">{showTopicsInstead ? "Subject Area" : "Publication by Subject"}</h3>
              {showTopicsInstead ? (
                !byTopic.length ? (
                  <div className="muted" style={{ padding: 10 }}>No topic data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={COMPACT_BAR_HEIGHT}>
                    <BarChart data={byTopic} layout="vertical" barSize={8} margin={{ top: 2, right: 12, bottom: 2, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="topic" width={0} tick={false} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <defs>
                        <linearGradient id="topicFill" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%"  stopColor="#6eace6" />
                          <stop offset="100%" stopColor="#84d81d" />
                        </linearGradient>
                      </defs>
                      <Bar
                        dataKey="count"
                        name="Publications"
                        fill="url(#topicFill)"
                        radius={[0,3,3,0]}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={({ payload }) => {
                          const t = payload?.topic;
                          if (t) setTopicSel(prev => (prev === t ? "" : t));
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                !bySubject.length ? (
                  <div className="muted" style={{ padding: 8 }}>No subject data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={COMPACT_BAR_HEIGHT}>
                    <BarChart data={bySubject} layout="vertical" barSize={12} margin={{ top: 2, right: 8, bottom: 2, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="subject" width={0} tick={false} axisLine={false} tickLine={false} />
                      <Tooltip content={<SubjectTooltip />} />
                      <defs>
                        <linearGradient id="subjectFill" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%"  stopColor="#7e95e3" />
                          <stop offset="100%" stopColor="#1d4ed8" />
                        </linearGradient>
                      </defs>
                      <Bar
                        dataKey="count"
                        name="Publications"
                        fill="url(#subjectFill)"
                        radius={[0,3,3,0]}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={({ payload }) => {
                          const s = payload?.subject;
                          if (s) setSubjectSel(prev => (prev === s ? "" : s));
                        }}
                      >
                        <LabelList dataKey="count" position="right" offset={6} style={{ pointerEvents: "none" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}
            </div>

            <div className="card chart-card authors-card">
              <h3 className="tight">Top Authors</h3>
              {!topAuthors.length ? (
                <div className="muted" style={{ padding: 8 }}>No author data.</div>
              ) : (
                <ResponsiveContainer width="100%" height={COMPACT_BAR_HEIGHT}>
                  <ComposedChart data={topAuthors} layout="vertical" margin={{ top: 2, right: 25, bottom: 2, left: 2 }}>
                    <CartesianGrid strokeDasharray="4 3" stroke={COLOR_GRID} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="author" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip content={<AuthorTooltip />} />
                    <Bar
                      dataKey="count"
                      name="Publications"
                      fill="#840692"
                      barSize={8}
                      radius={[0,2,2,0]}
                      isAnimationActive={false}
                      cursor="pointer"
                      onClick={({ payload }) => {
                        const a = payload?.author;
                        if (a) setAuthorSel(prev => (prev === a ? "" : a));
                      }}
                    />
                    <Scatter dataKey="count" isAnimationActive={false} shape={(p)=>(
                      <g><circle cx={p.cx} cy={p.cy} r={5} /><circle cx={p.cx} cy={p.cy} r={5} fill="none" stroke="white" strokeWidth={1.2} /></g>
                    )}>
                      <LabelList dataKey="count" position="right" offset={6} style={{ pointerEvents: "none" }} />
                    </Scatter>
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: scrollable table */}
        <div className="right-table card">
          <div className="table-header">
            <h3 className="tight">List of Publications</h3>
            <div className="pager">
              <span className="count">
                {totalRows ? `${startIndex + 1}–${endIndex} of ${totalRows}` : "0 of 0"}
              </span>
              <div className="pager-buttons">
                <button className="btn pager-btn" onClick={() => setPage(0)} disabled={page === 0} title="First">« First</button>
                <button className="btn pager-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} title="Previous">‹ Prev</button>
                <button className="btn pager-btn" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} title="Next">Next ›</button>
                <button className="btn pager-btn" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} title="Last">Last »</button>
              </div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="table pubs compact sticky">
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "auto" }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Author(s)</th>
                  <th>Publication Title</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((d, i) => {
                  const title = d.title || "—";
                  const authorList = (d.authors || []).join(", ") || "—";
                  return (
                    <tr key={`${d.id}-${i}`}>
                      <td className="mono">{d.year ?? "—"}{d.month ? ` (${MONTHS[d.month - 1]})` : ""}</td>
                      <td className="venue-cell"><div className="clamp-1" title={authorList}>{authorList}</div></td>
                      <td className="title-cell"><div className="clamp-2" title={title}>{title}</div></td>
                      <td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" aria-label={`Open ${title}`}>Open</a> : "—"}</td>
                    </tr>
                  );
                })}
                {!tableRows.length && <tr><td colSpan={4} className="muted">No results.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {loading && <div className="card muted" style={{ textAlign: "center" }}>Loading…</div>}
      {error   && <div className="card" style={{ color: "#b91c1c", background: "#fee2e2" }}>Error: {error}</div>}
    </div>
  );
}