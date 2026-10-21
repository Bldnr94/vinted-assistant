// How the shop is doing: what sold, what it earned, how fast, and what has been sitting too long.
// Figures come from src/stats.ts; nothing here writes data.
import { useEffect, useState } from "react";
import type { Go } from "./App";
import { listItems, listSales, type Item, type Sale } from "./db";
import { euros, monthLabel } from "./format";
import { agingStock, allTime, inRange, lastDays, monthly, summarise, thisMonth, thisYear, topBy, type Range, type TopRow } from "./stats";
import "./stats.css";

type RangeKey = "month" | "d30" | "year" | "all";
const RANGES: Record<RangeKey, { label: string; make: (now: number) => Range }> = {
  month: { label: "This month", make: thisMonth },
  d30: { label: "30 days", make: (now) => lastDays(30, now) },
  year: { label: "This year", make: thisYear },
  all: { label: "All", make: () => allTime },
};

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function TopTable({ title, rows }: { title: string; rows: TopRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h2 className="or">{title}</h2>
      <table className="top-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sold</th>
            <th>Revenue</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.count}</td>
              <td>{euros(r.revenue)}</td>
              <td>{euros(r.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Stats({ go }: { go: Go }) {
  const [data, setData] = useState<{ sales: Sale[]; items: Item[] }>();
  const [rangeKey, setRangeKey] = useState<RangeKey>("year");
  useEffect(() => {
    void Promise.all([listSales(), listItems()]).then(([sales, items]) => setData({ sales, items }));
  }, []);
  if (!data) return null;

  const { sales, items } = data;
  const now = Date.now();
  const range = RANGES[rangeKey].make(now);
  const s = summarise(sales, items, range);
  const inside = sales.filter((x) => inRange(x.soldAt, range));
  const months = monthly(sales, 6, now);
  const top = Math.max(1, ...months.map((m) => m.revenue));
  const buckets = agingStock(items, now);
  const oldest = buckets[buckets.length - 1];
  const liveCount = buckets.reduce((n, b) => n + b.items.length, 0);

  if (sales.length === 0 && liveCount === 0) {
    return (
      <>
        <header>
          <h1>Stats</h1>
        </header>
        <p className="hint">Mark an item sold and its revenue, profit and how fast it sold will show up here.</p>
      </>
    );
  }

  return (
    <>
      <header>
        <h1>Stats</h1>
      </header>
      <div className="chips" role="tablist">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <button key={k} className={k === rangeKey ? "chip on" : "chip"} onClick={() => setRangeKey(k)}>
            {RANGES[k].label}
          </button>
        ))}
      </div>

      <div className="stat-cards">
        <Card label="Revenue" value={euros(s.revenue)} note={s.avgPrice !== undefined ? `${euros(s.avgPrice)} on average` : undefined} />
        <Card label="Profit" value={euros(s.profit)} />
        <Card label="Sold" value={String(s.count)} />
        <Card label="Margin" value={s.marginPct !== undefined ? `${s.marginPct}%` : "–"} note="on sales with a cost" />
        <Card label="Time to sell" value={s.avgDaysToSell !== undefined ? `${s.avgDaysToSell} days` : "–"} />
        <Card label="Sell-through" value={s.sellThrough !== undefined ? `${s.sellThrough}%` : "–"} note="sold vs still live" />
      </div>
      {s.missingCost > 0 && (
        <p className="hint">
          {s.missingCost} {s.missingCost === 1 ? "sale has" : "sales have"} no cost yet, so the profit is partial. Add what you paid in{" "}
          <button className="link" onClick={() => go({ name: "sales" })}>
            Sales
          </button>
          .
        </p>
      )}
      {s.count === 0 && <p className="hint">No sales in this period.</p>}

      <h2 className="or">Last 6 months</h2>
      <ul className="month-bars" aria-label="Revenue by month">
        {months.map((m) => (
          <li key={m.month}>
            <span className="m">{monthLabel(m.month)}</span>
            <span className="bar">
              <i style={{ width: `${(m.revenue / top) * 100}%` }} />
            </span>
            <span className="v">
              {euros(m.revenue)}
              <small> · {euros(m.profit)} profit</small>
            </span>
          </li>
        ))}
      </ul>

      <h2 className="or">Live items by age</h2>
      <ul className="age-list">
        {buckets.map((b, i) => (
          <li key={b.label} className={i === buckets.length - 1 && b.items.length > 0 ? "age old" : "age"}>
            <span>{b.label}</span>
            <span>
              {b.items.length} {b.items.length === 1 ? "item" : "items"} · {euros(b.value)}
              {b.cost > 0 && <small> · paid {euros(b.cost)}</small>}
            </span>
          </li>
        ))}
      </ul>
      {oldest.items.length > 0 && (
        <>
          <p className="hint">These have been live over 90 days. A price drop is the usual fix; the reminders are on Items.</p>
          <ul className="old-items">
            {oldest.items.slice(0, 5).map((it) => (
              <li key={it.id}>
                <button className="link" onClick={() => go({ name: "item", id: it.id })}>
                  {it.draft?.title || "Untitled item"}
                </button>
                <span>{euros(it.listedPrice)}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => go({ name: "home" })}>Go to Items</button>
        </>
      )}

      <TopTable title="Top brands" rows={topBy(inside, "brand", 5)} />
      <TopTable title="Top categories" rows={topBy(inside, "category_path", 5)} />
    </>
  );
}
