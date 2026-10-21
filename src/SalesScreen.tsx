// Every sale, newest first, with what it earned. A sale can be completed later: what you paid,
// shipping, fees and dates. Tap a row to edit it.
import { useEffect, useState } from "react";
import type { Go } from "./App";
import { deleteSale, getItem, listItems, listSales, saveItem, saveSale, type Item, type Sale } from "./db";
import { dateFr, euros, fromDateInput, toDateInput } from "./format";
import { parseMoney, profitOf, withoutUndefined } from "./sales";
import { allTime, inRange, summarise, thisMonth, thisYear, type Range } from "./stats";
import "./sales.css";

type RangeKey = "month" | "year" | "all";
const RANGES: Record<RangeKey, { label: string; make: (now: number) => Range }> = {
  month: { label: "This month", make: thisMonth },
  year: { label: "This year", make: thisYear },
  all: { label: "All", make: () => allTime },
};

export function Sales({ go }: { go: Go }) {
  const [sales, setSales] = useState<Sale[]>();
  const [items, setItems] = useState<Item[]>([]);
  const [rangeKey, setRangeKey] = useState<RangeKey>("year");
  const [open, setOpen] = useState<string>();
  const load = async () => {
    const [s, i] = await Promise.all([listSales(), listItems()]);
    setSales(s);
    setItems(i);
  };
  useEffect(() => {
    void load();
  }, []);
  if (!sales) return null;

  const range = RANGES[rangeKey].make(Date.now());
  const shown = sales.filter((s) => inRange(s.soldAt, range)).sort((a, b) => b.soldAt - a.soldAt);
  const total = summarise(sales, items, range);
  const existing = new Set(items.map((i) => i.id));

  return (
    <>
      <header>
        <h1>Sales</h1>
      </header>
      <div className="chips" role="tablist">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <button key={k} className={k === rangeKey ? "chip on" : "chip"} onClick={() => setRangeKey(k)}>
            {RANGES[k].label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="hint">No sales in this period. Mark an item sold from its page and it appears here.</p>
      ) : (
        <>
          <div className="sales-total">
            <div>
              <small>{total.count} {total.count === 1 ? "sale" : "sales"}</small>
              <strong>{euros(total.revenue)}</strong>
            </div>
            <div>
              <small>Profit</small>
              <strong>{euros(total.profit)}</strong>
            </div>
          </div>
          {total.missingCost > 0 && (
            <p className="hint">
              {total.missingCost} {total.missingCost === 1 ? "sale has" : "sales have"} no cost yet, so the profit is partial. Tap a sale to add what you paid.
            </p>
          )}
          <ul className="sales-list">
            {shown.map((s) => {
              const p = profitOf(s);
              return (
                <li key={s.itemId}>
                  <button className="sale-row" aria-expanded={open === s.itemId} onClick={() => setOpen(open === s.itemId ? undefined : s.itemId)}>
                    <span>
                      <strong>{s.title || "Untitled item"}</strong>
                      <small>
                        {dateFr(s.soldAt)} · {euros(p.profit)} {p.costKnown ? "profit" : "before cost"}
                      </small>
                    </span>
                    <b>{euros(s.soldPrice)}</b>
                  </button>
                  {open === s.itemId && (
                    <SaleEditor
                      key={s.itemId}
                      sale={s}
                      hasItem={existing.has(s.itemId)}
                      go={go}
                      onDone={() => {
                        setOpen(undefined);
                        void load();
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function SaleEditor({ sale, hasItem, go, onDone }: { sale: Sale; hasItem: boolean; go: Go; onDone: () => void }) {
  const text = (n: number | undefined) => (n === undefined ? "" : String(n));
  const [price, setPrice] = useState(text(sale.soldPrice));
  const [cost, setCost] = useState(text(sale.costPrice));
  const [shipping, setShipping] = useState(text(sale.shippingCost));
  const [fees, setFees] = useState(text(sale.otherFees));
  const [soldOn, setSoldOn] = useState(toDateInput(sale.soldAt));
  const [paidOn, setPaidOn] = useState(toDateInput(sale.paidAt));
  const [error, setError] = useState("");

  const save = async () => {
    const soldPrice = parseMoney(price);
    if (soldPrice === undefined || soldPrice <= 0) return setError("Enter the price it sold for.");
    // A date is only rewritten when it was changed, so the exact time of the sale is kept otherwise.
    const soldAt = soldOn === toDateInput(sale.soldAt) ? sale.soldAt : fromDateInput(soldOn);
    if (soldAt === undefined) return setError("Enter the date it sold.");
    const paidAt = paidOn === "" ? undefined : paidOn === toDateInput(sale.paidAt) ? sale.paidAt : fromDateInput(paidOn);
    const costPrice = parseMoney(cost);

    await saveSale(withoutUndefined({ ...sale, soldPrice, soldAt, paidAt, costPrice, shippingCost: parseMoney(shipping), otherFees: parseMoney(fees) }));
    const item = await getItem(sale.itemId);
    if (item?.status === "sold") await saveItem(withoutUndefined({ ...item, soldPrice, soldAt, costPrice }));
    onDone();
  };

  return (
    <div className="sale-editor">
      <div className="grid">
        <label>
          Sold for (€)
          <input type="number" inputMode="decimal" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          Bought for (€)
          <input type="number" inputMode="decimal" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label>
          Shipping you paid (€)
          <input type="number" inputMode="decimal" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </label>
        <label>
          Other fees (€)
          <input type="number" inputMode="decimal" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </label>
        <label>
          Sold on
          <input type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} />
        </label>
        <label>
          Paid out on
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      <p className="hint">Leave "Paid out on" empty if the money reached you when it sold.</p>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={onDone}>Cancel</button>
        {hasItem && <button onClick={() => go({ name: "item", id: sale.itemId })}>Open item</button>}
        {!hasItem && (
          <button
            className="danger"
            onClick={async () => {
              if (confirm("Remove this sale record? It will no longer count in your totals.")) {
                await deleteSale(sale.itemId);
                onDone();
              }
            }}
          >
            Remove record
          </button>
        )}
      </div>
    </div>
  );
}
