// The Pro tab: turnover against the official thresholds, and the two registers as CSV. Information only,
// not tax advice. Figures and their sources live in proThresholds.ts.
import { useEffect, useState } from "react";
import { readProfile } from "./businessProfile";
import { purchasesCsv, receiptsCsv } from "./csv";
import { listItems, listSales, type Item, type Sale } from "./db";
import { download } from "./download";
import { dateLong, euros, yearOf } from "./format";
import { purchasesRegister, receiptsRegister, receivedAt, thresholdProgress, yearTotals, type Progress, type ThresholdStatus } from "./pro";
import { PRO_THRESHOLDS, thresholdsAreStale } from "./proThresholds";
import "./pro.css";

const STATUS_TEXT: Record<ThresholdStatus, string> = {
  below: "Below the threshold",
  near: "Close to the threshold",
  over: "Threshold reached or exceeded",
  unknown: "Not verified",
};

const value = (p: Progress, n: number) => (p.spec.unit === "count" ? String(n) : euros(n));

function ThresholdCard({ p }: { p: Progress }) {
  return (
    <li className={`threshold ${p.status}`}>
      <div className="head">
        <strong>{p.spec.label}</strong>
        <span className="status">{STATUS_TEXT[p.status]}</span>
      </div>
      {p.pct !== undefined && (
        <div className="meter" role="img" aria-label={`${p.pct}% of the threshold`}>
          <i style={{ width: `${Math.min(p.pct, 100)}%` }} />
        </div>
      )}
      <div className="figures">
        {value(p, p.used)}
        {p.spec.limit !== null && ` of ${value(p, p.spec.limit)}`}
        {p.pct !== undefined && ` · ${p.pct}%`}
      </div>
      {p.spec.note && <small>{p.spec.note}</small>}
      {p.spec.sourceUrl && (
        <small>
          <a href={p.spec.sourceUrl} target="_blank" rel="noreferrer">
            Official source
          </a>
        </small>
      )}
    </li>
  );
}

export function Pro() {
  const [data, setData] = useState<{ sales: Sale[]; items: Item[] }>();
  const [year, setYear] = useState(() => yearOf(Date.now()));
  useEffect(() => {
    void Promise.all([listSales(), listItems()]).then(([sales, items]) => setData({ sales, items }));
  }, []);
  if (!data) return null;

  const { sales, items } = data;
  const now = Date.now();
  const years = [...new Set([yearOf(now), ...sales.map((s) => yearOf(receivedAt(s)))])].sort((a, b) => b - a);
  const totals = yearTotals(sales, year);
  const progress = thresholdProgress(totals, PRO_THRESHOLDS.specs);
  const receipts = receiptsRegister(sales, year);
  const purchases = purchasesRegister(sales, items, year);
  const estimated = purchases.filter((r) => r.dateEstimated).length;
  const profile = readProfile();

  return (
    <>
      <header>
        <h1>Pro</h1>
      </header>
      <p className="warn">Information only, not tax advice. Check with your accountant or the official sites linked below.</p>
      <div className="chips" role="tablist">
        {years.map((y) => (
          <button key={y} className={y === year ? "chip on" : "chip"} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>
      <p className="hint">
        {totals.count} {totals.count === 1 ? "sale" : "sales"}, {euros(totals.turnover)} received in {year}, counted by the day the money reached you.
      </p>

      <ul className="thresholds">
        {progress.map((p) => (
          <ThresholdCard key={p.spec.key} p={p} />
        ))}
      </ul>
      <p className="hint">Figures checked on {dateLong(Date.parse(PRO_THRESHOLDS.asOf))}.</p>
      {thresholdsAreStale(now) && <p className="warn">These figures were checked over a year ago and may be out of date. Check the sources before relying on them.</p>}
      <p className="hint">
        Vinted asks professional sellers to use a Vinted Pro account.{" "}
        <a href="https://www.vinted.fr/help/1120-ventes-commerciales" target="_blank" rel="noreferrer">
          What Vinted says
        </a>
        .
      </p>

      <h2 className="or">Registers for {year}</h2>
      {!profile.siret && <p className="hint">Add your business details in Settings to keep them with your records.</p>}
      <div className="actions">
        <button
          className="primary"
          disabled={receipts.length === 0}
          onClick={() => download(new Blob([receiptsCsv(receipts)], { type: "text/csv;charset=utf-8" }), `registre-recettes-${year}.csv`)}
        >
          Receipts register (CSV) · {receipts.length}
        </button>
        <button
          disabled={purchases.length === 0}
          onClick={() => download(new Blob([purchasesCsv(purchases)], { type: "text/csv;charset=utf-8" }), `registre-achats-${year}.csv`)}
        >
          Purchases register (CSV) · {purchases.length}
        </button>
      </div>
      <p className="hint">
        The receipts register lists each sale on the day the money arrived. The purchases register comes from the costs you entered
        {estimated > 0 && `; ${estimated} ${estimated === 1 ? "row has" : "rows have"} an estimated date because no purchase date was entered`}. A lot bought in
        one go is one line: split it across items if your accountant needs it itemised.
      </p>

      <details>
        <summary>Sources</summary>
        <ul className="sources">
          {PRO_THRESHOLDS.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
