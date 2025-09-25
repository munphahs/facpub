import React, { Fragment, useEffect, useMemo, useState, useDeferredValue, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Brush,
  LabelList,
  ComposedChart, Scatter, Cell,
  PieChart, Pie
} from "recharts";
import YearMonthPicker from "./YearMonthPicker";
import { inferTopic } from "./topicRules";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* ------------------------------ Constants ------------------------------ */
const PANEL_H       = 350;
const COLOR_GRID    = "#e5e7eb";
const MONTHS        = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_COLORS  = ["#6366F1","#10B981","#F59E0B","#EF4444","#3B82F6","#8B5CF6","#22C55E","#EAB308","#F97316","#06B6D4","#84CC16","#F43F5E"];
const HEAT_COLORS   = ["#EEF2FF","#E0E7FF","#C7D2FE","#A5B4FC","#93C5FD","#60A5FA","#3B82F6","#1D4ED8","#1E40AF"];
const UNSPECIFIED   = "Unspecified";
const MIN_YEAR      = 2003;

/* ------------------------------ Month parsing helpers ------------------------------ */
const MONTH_NAME_TO_NUM = {
  jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4, may:5,
  jun:6, june:6, jul:7, july:7, aug:8, august:8, sep:9, sept:9, september:9,
  oct:10, october:10, nov:11, november:11, dec:12, december:12,
};

function coerceInt(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (lo != null && v < lo) return null;
  if (hi != null && v > hi) return null;
  return Math.trunc(v);
}

function gatherDateCandidates(rec) {
  const out = [];
  const pushVal = (val, key="") => {
    if (val == null) return;
    if (typeof val === "string" || typeof val === "number") {
      if (!key || /(date|issued|publish|created|updated|cover)/i.test(key)) out.push(String(val));
    } else if (Array.isArray(val)) {
      for (const it of val) pushVal(it, key);
    } else if (typeof val === "object") {
      if (val["date-parts"] && Array.isArray(val["date-parts"]) && val["date-parts"][0]) {
        const dp = val["date-parts"][0];
        const y = dp[0], m = dp[1], d = dp[2];
        out.push([y, m, d].filter(Boolean).join("-"));
      }
      const y = val.year ?? val.Year ?? val.YYYY;
      const mo = val.month ?? val.Month ?? val.MM;
      if (y || mo) out.push(`${y ?? ""}-${mo ?? ""}`);
      for (const [k, v] of Object.entries(val)) pushVal(v, k);
    }
  };
  for (const [k, v] of Object.entries(rec)) pushVal(v, k);

  const extraKeys = [
    "date","Date","published","issued","created","updated","coverDate",
    "dc.date","dc.date.issued","dc.date.created","dc.date.available",
    "publicationDate","Publication Date","Date Published"
  ];
  for (const k of extraKeys) if (rec[k] != null) out.push(String(rec[k]));

  const explicitMonth = rec.month ?? rec.Month ?? rec["dc.date.issued.month"];
  const explicitYear  = rec.year  ?? rec.Year  ?? rec["dc.date.issued.year"];
  if (explicitMonth != null || explicitYear != null) out.push(`${explicitYear ?? ""}-${explicitMonth ?? ""}`);

  return Array.from(new Set(out));
}

function parseYearMonthFromAny(rec) {
  const candidates = gatherDateCandidates(rec).map(s => cleanText(String(s)).toLowerCase());

  for (const s of candidates) {
    let m = s.match(/\b(20\d{2}|19\d{2})[\/\-\. ](\d{1,2})(?:[\/\-\. ]\d{1,2})?\b/);
    if (m) return { year: +m[1], month: Math.max(1, Math.min(12, +m[2])) };

    m = s.match(/\b(20\d{2}|19\d{2})\s*[-\/]?\s*(0?[1-9]|1[0-2])\b/);
    if (m) return { year: +m[1], month: +m[2] };

    m = s.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2}|19\d{2})\b/);
    if (m) return { year: +m[2], month: MONTH_NAME_TO_NUM[m[1]] || null };

    m = s.match(/\b(20\d{2}|19\d{2})\s*[-\/ ]\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
    if (m) return { year: +m[1], month: MONTH_NAME_TO_NUM[m[2]] || null };

    m = s.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
    if (m) return { year: null, month: MONTH_NAME_TO_NUM[m[1]] || null };

    m = s.match(/\b(20\d{2}|19\d{2})\b/);
    if (m) return { year: +m[1], month: null };
  }
  return { year: null, month: null };
}

/* ------------------------------ Utils ------------------------------ */
const isNum   = (n) => Number.isFinite(n);
const shorten = (s = "", n = 22) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const BASE    = (import.meta?.env?.BASE_URL ?? "/");
const withBase = (p) => BASE + String(p || "").replace(/^\/+/, "");
const squashSpaces = (s="") => String(s).replace(/\s+/g, " ").trim();
const normalizeDashesQuotes = (s="") =>
  s.replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
const cleanText = (s="") => squashSpaces(normalizeDashesQuotes(String(s)));

async function tryFetchJson(relPath) {
  const url = withBase(relPath);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } catch (e) { console.error("[tryFetchJson] Failed", e); return null; }
}

function heatColor(v, vmax) {
  if (!vmax || v <= 0) return HEAT_COLORS[0];
  const t = Math.sqrt(v / vmax);
  const idx = Math.min(HEAT_COLORS.length - 1, Math.max(1, Math.round(t * (HEAT_COLORS.length - 1))));
  return HEAT_COLORS[idx];
}

/* ------------------------- Title/Author & Subject helpers ------------------------- */
const _splitByConj = (s) =>
  cleanText(s).replace(/\bet\s*al\.?$/i, "")
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
  const fields = [r.authors, r.author, r.creators, r.creator, r.contributors, r.contributor,
    r["dc.creator"], r["dc.contributor"], r.creatorNames, r.Author, r.Authors].filter(v => v != null);
  const out = [];
  for (const v of fields) {
    if (typeof v === "string") out.push(..._splitByConj(v));
    else if (Array.isArray(v)) for (const it of v)
      out.push(..._splitByConj(typeof it === "string" ? it : _nameFromObj(it)));
    else if (v && typeof v === "object") out.push(..._splitByConj(_nameFromObj(v)));
  }
  return dedupeCI(out.map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean));
};

const normalizeSubject = (s) => cleanText(s).replace(/[.;,:]$/, "");
const collectSubjects = (r) => {
  const fields = [r.subject, r.subjects, r["dc.subject"], r["dc.subjects"],
    r.keywords, r.keyword, r.tags, r.tag, r.discipline, r.disciplines].filter(v => v != null);
  const out = [];
  for (const v of fields) {
    if (typeof v === "string") out.push(..._splitByConj(v));
    else if (Array.isArray(v)) for (const it of v)
      out.push(..._splitByConj(typeof it === "string" ? it : _subjectFromObj(it)));
    else if (v && typeof v === "object") out.push(..._splitByConj(_subjectFromObj(v)));
  }
  return dedupeCI(out.map(x => normalizeSubject(x)).filter(Boolean));
};

const looksLikeAuthorList = (s = "") => {
  const str = cleanText(s); if (!str) return false;
  const parts = str.split(/\s*,\s*/).filter(Boolean);
  if (parts.length < 2) return false;
  let signal = 0;
  for (const p of parts) if (/^[A-Z][a-zA-Z'’\-]+(?:\s+[A-Z]{1,3}\.?)?$/.test(p)) signal++;
  return signal >= Math.max(2, Math.floor(parts.length * 0.6));
};

function fixTitleAndAuthors(rawTitle = "", rawVenue = "", authors = []) {
  let title = cleanText(rawTitle), venue = cleanText(rawVenue), outAuthors = [...authors];
  if ((!outAuthors.length) && looksLikeAuthorList(title)) {
    outAuthors = _splitByConj(title);
    if (venue) { title = venue; venue = ""; }
  }
  return { title, venue, authors: outAuthors };
}

/* ----------------------------- DOI helpers + cache ----------------------------- */
const DOI_RE = /(10\.\d{4,9}\/[^\s"'>]+)/i;

const extractDoi = (url = "") => {
  if (!url) return "";
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch {}
  const m = decoded.replace(/https?:\/\/(dx\.)?doi\.org\//i, "").match(DOI_RE);
  return m ? m[1] : "";
};

const CR_CACHE_KEY = "cr-cache-v1";
function loadCrCache() {
  try { return JSON.parse(localStorage.getItem(CR_CACHE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveCrCache(cache) {
  try { localStorage.setItem(CR_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

async function fillRealTitles(rows, { batchSize = 8, timeoutMs = 9000, max = 80, cache = {} } = {}) {
  const need = rows
    .filter(r => r.title && looksLikeAuthorList(r.title))
    .map(r => ({ r, doi: extractDoi(r.url || "") }))
    .filter(x => !!x.doi)
    .slice(0, max);

  if (!need.length) return { rows, cache };

  const updates = new Map();
  const getOne = async (doi) => {
    if (cache[doi]) return cache[doi];
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const js = await res.json();
      const m = js?.message || {};
      const title = cleanText((m.title && m.title[0]) || "");
      const venue = cleanText((m["container-title"] && m["container-title"][0]) || "");
      const val = { title, venue };
      cache[doi] = val;
      return val;
    } catch {
      const val = { title: "", venue: "" };
      cache[doi] = val;
      return val;
    } finally { clearTimeout(t); }
  };

  for (let i = 0; i < need.length; i += batchSize) {
    const chunk = need.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map(x => getOne(x.doi)));
    results.forEach((res, idx) => updates.set(chunk[idx].r.id, res));
  }

  const outRows = rows.map(r => {
    const upd = updates.get(r.id);
    if (!upd) return r;
    const fixedTitle = upd.title || r.title;
    const fixedVenue = upd.venue || r.venue;
    if (upd.title) return { ...r, title: fixedTitle, venue: fixedVenue };
    if (looksLikeAuthorList(r.title) && fixedVenue) return { ...r, title: fixedVenue, venue: "" };
    return r;
  });

  return { rows: outRows, cache };
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
/*                                MAIN                                   */
/* ===================================================================== */
export default function FacultyPubsDashboard() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // filters
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.toLowerCase());
  const [yearSel,  setYearSel]  = useState(null);
  const [monthSel, setMonthSel] = useState(null);
  const [authorSel, setAuthorSel] = useState("");
  const [subjectSel, setSubjectSel] = useState("");
  const [topicSel, setTopicSel] = useState("");

  // year range via Brush (inclusive)
  const [yearRange, setYearRange] = useState(null);
  const [brushIdx, setBrushIdx] = useState({ start: 0, end: 0 });

  // table paging
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
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

          const topic    = inferTopic({ title, url: r.url ?? "", year: r.year });

          // year/month extraction
          let year  = coerceInt(r.year,  MIN_YEAR, 3000);
          let month = coerceInt(r.month, 1, 12);
          if (month == null && typeof r.month === "string") {
            const k = r.month.trim().toLowerCase();
            month = MONTH_NAME_TO_NUM[k] ?? MONTH_NAME_TO_NUM[k.slice(0,3)] ?? null;
          }
          if (year == null || month == null) {
            const ym = parseYearMonthFromAny(r);
            if (year  == null && ym.year  != null) year  = coerceInt(ym.year,  MIN_YEAR, 3000);
            if (month == null && ym.month != null) month = coerceInt(ym.month, 1, 12);
          }

          const url   = cleanText(r.url || r.link || "");
          const id = String(r.id || `${year || "x"}-${title}-${i}`)
            .normalize("NFKD").replace(/[^\w\-]+/g, "-").slice(0, 160);

          return {
            id, title, venue, type, format, authors, subjects, topic, year, month, url,
            lcTitle: (title || "").toLowerCase(),
            lcVenue: (venue || "").toLowerCase(),
            lcSubjects: subjects.map(s => s.toLowerCase()),
            lcAuthors: authors.map(a => a.toLowerCase())
          };
        })
        .filter(r => r.title)
        .filter(r => !r.year || (r.year >= MIN_YEAR && r.year <= new Date().getFullYear() + 1));

      setRows(cleaned);
      setLoading(false);

      // background title fix via Crossref
      const cache = loadCrCache();
      fillRealTitles(cleaned, { cache, max: 80 }).then(({ rows: enriched, cache: newCache }) => {
        saveCrCache(newCache);
        const changed = enriched.some((r, idx) => r.title !== cleaned[idx]?.title || r.venue !== cleaned[idx]?.venue);
        if (!changed) return;

        setRows(prev => {
          const prevMap = new Map(prev.map(x => [x.id, x]));
          return enriched.map(r => {
            const before = prevMap.get(r.id);
            const titleChanged = before && r.title !== before.title;
            return titleChanged
              ? { ...r, topic: inferTopic({ title: r.title, url: r.url, year: r.year }) }
              : r;
          });
        });
      }).catch(() => {});
    })();
  }, []);

  /* ------------------------------ Derived: filtering ------------------------------ */
  const filtered = useMemo(() => {
    const query = dq.trim();
    return rows.filter(r => {
      const inExactYear = !yearSel || r.year === yearSel;
      const inRange = !yearRange || (isNum(r.year) && r.year >= yearRange.from && r.year <= yearRange.to);
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

  // for Year bars completeness (ignore time filters)
  const filteredNoTime = useMemo(() => {
    const query = dq.trim();
    return rows.filter(r => {
      const inAuthor  = !authorSel  || (r.authors || []).includes(authorSel);
      const subs      = r.subjects?.length ? r.subjects : [UNSPECIFIED];
      const inSubject = !subjectSel || subs.includes(subjectSel);
      const inTopic   = !topicSel   || (r.topic || "Other") === topicSel;
      const inQuery = !query
        || r.lcTitle.includes(query)
        || r.lcVenue.includes(query)
        || r.lcSubjects.some(s => s.includes(query))
        || r.lcAuthors.some(a => a.includes(query));
      return inAuthor && inSubject && inTopic && inQuery;
    });
  }, [rows, dq, authorSel, subjectSel, topicSel]);

  /* ------------------------------ Paging ------------------------------ */
  const totalRows  = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const startIndex = page * PAGE_SIZE;
  const endIndex   = Math.min(startIndex + PAGE_SIZE, totalRows);
  const tableRows  = filtered.slice(startIndex, endIndex);

  /* ------------------------------ Charts data ------------------------------ */
  const byYear = useMemo(() => {
    const counts = new Map();
    for (const r of filteredNoTime) if (isNum(r.year)) counts.set(r.year, (counts.get(r.year) || 0) + 1);
    const years = [...counts.keys()];
    const minY = Math.max(MIN_YEAR, years.length ? Math.min(...years) : new Date().getFullYear() - 1);
    const maxY = years.length ? Math.max(...years) : new Date().getFullYear();
    const out = [];
    for (let y = minY; y <= maxY; y++) out.push({ year: y, count: counts.get(y) ?? 0 });
    if (out.length === 1) out.push({ year: out[0].year + 1, count: 0 });
    return out;
  }, [filteredNoTime]);

  useEffect(() => {
    if (!byYear.length) return;
    const firstYear = yearRange?.from ?? byYear[0].year;
    const lastYear  = yearRange?.to   ?? byYear[byYear.length - 1].year;
    const siRaw = byYear.findIndex(d => d.year === firstYear);
    const eiRaw = byYear.findIndex(d => d.year === lastYear);
    setBrushIdx({ start: siRaw < 0 ? 0 : siRaw, end: eiRaw < 0 ? byYear.length - 1 : eiRaw });
  }, [byYear, yearRange]);

  const filteredForHeat = useMemo(() => {
    let base = filteredNoTime;
    if (yearSel != null) base = base.filter(r => r.year === yearSel);
    else if (yearRange) base = base.filter(r => isNum(r.year) && r.year >= yearRange.from && r.year <= yearRange.to);
    if (monthSel != null) base = base.filter(r => r.month === monthSel);
    return base;
  }, [filteredNoTime, yearSel, yearRange, monthSel]);

  const heat = useMemo(() => {
    const m = new Map(); let vmax = 0;
    for (const r of filteredForHeat) {
      if (!isNum(r.year) || !isNum(r.month)) continue;
      const key = `${r.year}|${r.month}`;
      const c = (m.get(key) || 0) + 1;
      m.set(key, c); if (c > vmax) vmax = c;
    }
    return { get: (y, mo) => m.get(`${y}|${mo}`) || 0, vmax };
  }, [filteredForHeat]);

  const byMonth = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, label: MONTHS[i], count: 0 }));
    for (const r of filtered) if (isNum(r.month)) base[r.month - 1].count += 1;
    return base;
  }, [filtered]);

  const totalMonthCounts = useMemo(() => byMonth.reduce((s, d) => s + d.count, 0), [byMonth]);

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

  const bySubject = useMemo(() => bySubjectRaw.filter(x => x.subject !== UNSPECIFIED).slice(0, 12), [bySubjectRaw]);

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
    const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: window.devicePixelRatio < 2 ? 2 : window.devicePixelRatio, useCORS: true, logging: false });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    if (imgH <= pageH) pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
    else {
      let srcY = 0;
      const sliceHpx = Math.floor((canvas.width * pageH) / pageW);
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width; tmp.height = sliceHpx;
      const ctx = tmp.getContext("2d");
      let first = true;
      while (srcY < canvas.height) {
        ctx.clearRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, srcY, tmp.width, sliceHpx, 0, 0, tmp.width, sliceHpx);
        const slice = tmp.toDataURL("image/png");
        if (!first) pdf.addPage();
        pdf.addImage(slice, "PNG", 0, 0, imgW, pageH);
        first = false; srcY += sliceHpx;
      }
    }
    captureRef.current.classList.remove("exporting");
    pdf.save("faculty-publications-dashboard.pdf");
  }

  /* ------------------------------ Heatmap panel ------------------------------ */
  function HeatmapPanel() {
    const yearsList = byYear.map(d => d.year);
    if (!yearsList.length || heat.vmax === 0) {
      return <div className="muted" style={{ padding: 8 }}>No month data.</div>;
    }
    const manyYears  = yearsList.length > 22;
    const colW       = manyYears ? 24 : 30;
    const rowH       = manyYears ? 22 : 26;
    const showCounts = !manyYears && heat.vmax >= 6;
    const headFmt    = (y) => (yearsList.length <= 16 ? String(y) : `’${String(y).slice(2)}`);

    return (
      <div className="heatmap-scroll" style={{ height: "100%", display:"flex", flexDirection:"column", minHeight:0 }}>
        <div style={{ overflow:"auto", flex:1, minHeight:0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `60px repeat(${yearsList.length}, ${colW}px)`,
              gridAutoRows: `${rowH}px`,
              gap: 6,
              alignItems: "center",
              padding: 8,
              paddingBottom: 6,
            }}
          >
            <div className="heat-sticky-top" style={{ fontSize: 11, color: "#6b7280" }} />
            {yearsList.map((y) => (
              <div key={`yh-${y}`} className="mono heat-sticky-top" style={{ fontSize: 11, textAlign: "center", color: "#6b7280", background:"#fff" }} title={String(y)}>
                {headFmt(y)}
              </div>
            ))}

            {MONTHS.map((mLabel, idx) => {
              const m = idx + 1;
              return (
                <Fragment key={`row-${m}`}>
                  <div className="heat-sticky-left" style={{ fontSize: 12, color: "#0f172a", paddingRight: 4, background:"#fff" }}>
                    {mLabel}
                  </div>
                  {yearsList.map((y) => {
                    const v = heat.get(y, m);
                    const bg = heatColor(v, heat.vmax);
                    const selected = yearSel === y && monthSel === m;
                    return (
                      <button
                        key={`cell-${y}-${m}`}
                        title={`${mLabel} ${y}: ${v} publications`}
                        onClick={() => { setYearSel(y); setMonthSel(m); setYearRange(null); }}
                        className={`heat-cell${selected ? " selected" : ""}`}
                        style={{ width: colW, height: rowH, background: bg, boxShadow: "inset 0 -1px 0 rgba(255,255,255,.35), 0 0 0 1px rgba(17,24,39,.04)" }}
                      >
                        {showCounts && v > 0 && <span style={{ fontSize:10, fontWeight:600 }}>{v}</span>}
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 8px 8px" }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Low</span>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${HEAT_COLORS.length},1fr)`, gap: 2, flex: 1 }}>
            {HEAT_COLORS.map((c, i) => <div key={i} style={{ height: 8, background: c, borderRadius: 2 }} />)}
          </div>
          <span style={{ fontSize: 11, color: "#6b7280" }}>High</span>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>max {heat.vmax || 0}</span>
        </div>
      </div>
    );
  }

  /* ------------------------------ UI ------------------------------ */
  return (
    <div ref={captureRef} className="wrap pretty" style={{ margin: "12px auto", padding: "0 8px" }}>
      {/* Header */}
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

      {/* Filters */}
      <div className="filters-row card" style={{ marginBottom: 12 }}>
        <div className="filter-combined">
          <div className="input-wrap">
            <span style={{opacity:.6}}>🔎</span>
            <input className="input" placeholder="Title, author, subject…" value={q} onChange={(e)=>setQ(e.target.value)} aria-label="Search publications" />
          </div>
          {/* <div className="ymp-compact">
            <YearMonthPicker
              valueYear={yearSel}
              valueMonth={monthSel}
              onChange={(y, m) => { setYearSel(y); setMonthSel(m); setYearRange(null); }}
              minYear={MIN_YEAR}
              maxYear={new Date().getFullYear()}
            />
          </div> */}
        </div>

        {(yearSel || monthSel || authorSel || subjectSel || topicSel || dq || yearRange) && (
          <div className="filter-item chips-block">
            <div className="hd small">Active Filters</div>
            <div className="chips tight">
              {yearSel   && <button className="chip" onClick={()=> setYearSel(null)}>Year: {yearSel} ✕</button>}
              {yearRange && <button className="chip" onClick={()=> setYearRange(null)}>Years: {yearRange.from}–{yearRange.to} ✕</button>}
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

      {/* ============ ROW A: Year bars + Donut + Table ============ */}
      <div className="rowA"
        style={{ display: "grid", gridTemplateColumns: "3fr 2fr 7fr", gap: 12, alignItems: "stretch", marginBottom: 12 }}>
        {/* Year bars */}
        <div className="card chart-card year-card" style={{ height: PANEL_H, display:"flex", flexDirection:"column" }}>
          <h3 className="tight">Publications by Year / Month </h3>
          <div style={{ flex:1, minHeight:0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byYear} margin={{ top: 4, right: 8, left: 6, bottom: 6 }} barSize={10} barCategoryGap={12}>
                <defs>
                  <linearGradient id="yearBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67d1ff" /><stop offset="100%" stopColor="#6d5cf4" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke={COLOR_GRID} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6b7280" }} tickMargin={6} axisLine={{ stroke: "#d1d5db" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis width={28} allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} formatter={(v) => [`${v} publications`, "Year"]} labelFormatter={(y) => `Year ${y}`} />
                <Bar dataKey="count" name="Publications" radius={[4,4,0,0]} isAnimationActive={false}>
                  {byYear.map((d, i) => (
                    <Cell
                      key={i}
                      fill={yearSel === d.year ? "#7c3aed" : "url(#yearBar)"}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        const y = Number(d?.year);
                        if (isNum(y)) { setYearSel(prev => (prev === y ? null : y)); setYearRange(null); }
                      }}
                    />
                  ))}
                </Bar>
                {byYear.length > 2 && (
                  <Brush
                    dataKey="year"
                    height={36}
                    travellerWidth={16}
                    stroke="#9ca3af"
                    fill="#eef2ff"
                    startIndex={brushIdx.start}
                    endIndex={brushIdx.end}
                    onChange={(rng) => {
                      if (!rng) return;
                      const si = Math.max(0, Math.min(byYear.length - 1, rng.startIndex ?? 0));
                      const ei = Math.max(0, Math.min(byYear.length - 1, rng.endIndex   ?? byYear.length - 1));
                      const from = byYear[Math.min(si, ei)]?.year;
                      const to   = byYear[Math.max(si, ei)]?.year;
                      setBrushIdx({ start: si, end: ei });
                      if (isNum(from) && isNum(to)) { setYearRange({ from, to }); setYearSel(null); }
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut by Month */}
        <div className="card chart-card donut-card" style={{ height: PANEL_H, display:"flex", flexDirection:"column" }}>
          {/* <h3 className="tight">By Month</h3> */}
          <div style={{ flex:1, minHeight:0, display:"flex" }}>
            {totalMonthCounts === 0 ? (
              <div className="muted" style={{ margin:"auto", fontSize: 12 }}>No month data.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byMonth}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="78%"
                    paddingAngle={1.5}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onClick={(e) => {
                      const m = Number(e?.payload?.m);
                      if (m) setMonthSel(prev => (prev === m ? null : m));
                    }}
                  >
                    {byMonth.map((_, i) => (
                      <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} opacity={monthSel && monthSel !== i+1 ? 0.45 : 1} />
                    ))}
                  </Pie>
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#374151">
                    {monthSel ? MONTHS[monthSel-1] : "All months"}
                  </text>
                  <Tooltip formatter={(v, _n, ctx) => [`${v} publications`, ctx?.payload?.label || "Month"]}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="right-table card" style={{ height: PANEL_H, display: "flex", flexDirection: "column" }}>
            <div className="table-header">
              <h3 className="tight">List of Publications</h3>
          
              {/* COMBINED pager */}
              <div className="pager" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <span className="count">
                  {totalRows ? `${startIndex + 1}–${endIndex} of ${totalRows}` : "0 of 0"}
                </span>
          
                <div className="pager-buttons" style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn pager-btn" onClick={() => setPage(0)} disabled={page === 0} title="First">« First</button>
                  <button className="btn pager-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} title="Previous">‹ Prev</button>
                  <button className="btn pager-btn" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} title="Next">Next ›</button>
                  <button className="btn pager-btn" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} title="Last">Last »</button>
                </div>
              </div>
            </div>
          <div className="table-scroll" style={{ flex:1, minHeight:0 }}>
            <table className="table pubs compact sticky">
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "auto" }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr><th>Year</th><th>Author(s)</th><th>Publication Title</th><th>Link</th></tr>
              </thead>
              <tbody>
                {tableRows.map((d, i) => {
                  const title = d.title || "—";
                  const displayTitle = ((!title || looksLikeAuthorList(title)) && d.venue) ? d.venue : title;
                  const authorList = (d.authors || []).join(", ") || "—";
                  return (
                    <tr key={`${d.id}-${i}`}>
                      <td className="mono">{d.year ?? "—"}{d.month ? ` (${MONTHS[d.month - 1]})` : ""}</td>
                      <td className="venue-cell"><div className="clamp-1" title={authorList}>{authorList}</div></td>
                      <td className="title-cell"><div className="clamp-2" title={displayTitle}>{displayTitle}</div></td>
                      <td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" aria-label={`Open ${displayTitle}`}>Open</a> : "—"}</td>
                    </tr>
                  );
                })}
                {!tableRows.length && <tr><td colSpan={4} className="muted">No results.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ============ ROW B: Subject + Authors + Heatmap ============ */}
      <div className="rowB"
        style={{ display: "grid", gridTemplateColumns: "3fr 2fr 7fr", gap: 12, alignItems: "stretch", marginBottom: 12 }}>
        {/* Subject / Topic */}
        <div className="card chart-card subject-card" style={{ height: PANEL_H, display:"flex", flexDirection:"column" }}>
          <h3 className="tight">{showTopicsInstead ? "Subject Areas" : "Subject Areas"}</h3>
          <div style={{ flex:1, minHeight:0 }}>
            {showTopicsInstead ? (
              byTopic.length === 0 ? (
                <div className="muted" style={{ padding: 10 }}>No topic data.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
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
                      onClick={({ payload }) => { const t = payload?.topic; if (t) setTopicSel(prev => (prev === t ? "" : t)); }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : (
              bySubject.length === 0 ? (
                <div className="muted" style={{ padding: 8 }}>No subject data.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={bySubject} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke={COLOR_GRID} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill:"#6b7280" }} />
                    <YAxis type="category" dataKey="subject" width={240} tick={{ fontSize: 11 }}
                           tickFormatter={(s) => (s.length > 28 ? s.slice(0,26) + "…" : s)} />
                    <Tooltip content={<SubjectTooltip/>} />
                    <Bar dataKey="count" barSize={6} radius={[0,3,3,0]} fill="#e5e7eb" />
                    <Bar dataKey="count" barSize={18} radius={[0,6,6,0]} isAnimationActive={false}
                         onClick={({ payload }) => setSubjectSel(prev => prev === payload.subject ? "" : payload.subject)}>
                      {bySubject.map((d, i) => <Cell key={i} fill={subjectSel === d.subject ? "#7c3aed" : "url(#topicFill)"} />)}
                    </Bar>
                    <defs>
                      <linearGradient id="topicFill" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"  stopColor="#6eace6"/><stop offset="100%" stopColor="#84d81d"/>
                      </linearGradient>
                    </defs>
                  </ComposedChart>
                </ResponsiveContainer>
              )
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", height: PANEL_H }}>
  {/* Authors Panel */}
  <div
    className="card chart-card authors-card"
    style={{
      width: "40%",
      minWidth: "300px",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <h3 className="tight">Authors</h3>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {topAuthors.length === 0 ? (
        <div className="muted" style={{ padding: 8 }}>
          No author data.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={topAuthors.length * 30}>
          <ComposedChart
            data={topAuthors}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 6" stroke={COLOR_GRID} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis
              type="category"
              dataKey="author"
              width={120}
              tick={{ fontSize: 11 }}
              tickFormatter={(s) => (s.length > 28 ? s.slice(0, 26) + "…" : s)}
            />
            <Tooltip content={<AuthorTooltip />} />
            <Bar dataKey="count" barSize={4} radius={[0, 2, 2, 0]} fill="#e5e7eb" />
            <Scatter
              dataKey="count"
              isAnimationActive={false}
              shape={(p) => {
                const selected = authorSel === p?.payload?.author;
                const r = selected ? 7 : 5;
                return (
                  <g
                    onClick={() => {
                      const a = p?.payload?.author;
                      if (a) setAuthorSel((prev) => (prev === a ? "" : a));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle cx={p.cx} cy={p.cy} r={r} fill="#7c3aed" />
                    <circle cx={p.cx} cy={p.cy} r={r} fill="none" stroke="#fff" strokeWidth={1.4} />
                  </g>
                );
              }}
            >
              <LabelList
                dataKey="count"
                position="right"
                offset={8}
                formatter={(v) => String(v)}
                style={{ fontSize: 11, fill: "#111827", pointerEvents: "none" }}
              />
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>

  {/* Heatmap Panel */}
  <div
    className="card heatmap-card"
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0, // allows flex item to shrink
    }}
  >
    <h3 className="tight">Year × Month</h3>
    <div style={{ flex: 1, minHeight: 0 }}>
      <HeatmapPanel />
    </div>
  </div>
</div>


      {loading && <div className="card muted" style={{ textAlign: "center" }}>Loading…</div>}
      {error   && <div className="card" style={{ color: "#b91c1c", background: "#fee2e2" }}>Error: {error}</div>}
    </div>
  );
}
