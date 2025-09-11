// Lightweight Year/Month popover used in the sidebar.
// Self-contained: no external constants or state from the dashboard.

import React from "react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function YearMonthPicker({
  valueYear,               // number|null
  valueMonth,              // 1..12|null
  onChange,                // (year|null, month|null) => void
  minYear = 2000,
  maxYear = new Date().getFullYear()
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const popRef = React.useRef(null);

  const label = `${valueYear ?? "All years"} · ${valueMonth ? MONTHS[valueMonth-1] : "All months"}`;

  // Close on outside click / Esc
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!popRef.current || !btnRef.current) return;
      if (!popRef.current.contains(e.target) && !btnRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const setYear  = (y) => onChange?.(y, valueMonth);
  const setMonth = (m) => onChange?.(valueYear, m);
  const clearAll = () => onChange?.(null, null);
  const thisMonth = () => {
    const d = new Date();
    onChange?.(d.getFullYear(), d.getMonth()+1);
  };

  return (
    <div className="card filter-block">
      <div className="hd">Year &amp; Month</div>

      <button
        ref={btnRef}
        className="btn-dropdown"
        type="button"
        onClick={() => setOpen(v=>!v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {label} <span className="caret">▼</span>
      </button>

      {open && (
        <div ref={popRef} className="popover" role="dialog" aria-label="Year and month picker" style={{maxWidth: 420}}>
          <div className="input-wrap" style={{marginBottom: 10}}>
            <input
              className="input"
              type="number"
              min={minYear}
              max={maxYear}
              placeholder="Year (e.g., 2022)"
              value={valueYear ?? ""}
              onChange={(e)=> {
                const raw = e.target.value;
                if (raw === "") return setYear(null);
                const y = Math.max(minYear, Math.min(maxYear, Number(raw)));
                if (Number.isFinite(y)) setYear(y);
              }}
            />
          </div>

          <div className="hd" style={{marginTop: 4, marginBottom: 6}}>Month</div>
          <div className="month-grid">
            <button type="button" className={`pill ${!valueMonth ? "active" : ""}`} onClick={() => setMonth(null)}>All</button>
            {MONTHS.map((m, i) => (
              <button
                key={`m-${i}`}
                type="button"
                className={`pill ${valueMonth === i + 1 ? "active" : ""}`}
                onClick={() => setMonth(i + 1)}
              >{m}</button>
            ))}
          </div>

          <div style={{display:"flex", justifyContent:"space-between", marginTop: 10}}>
            <button className="chip" onClick={clearAll}>Clear</button>
            <button className="chip" onClick={thisMonth}>This month</button>
          </div>
        </div>
      )}
    </div>
  );
}