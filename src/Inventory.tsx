// Inventory: every item with its status (draft, live, sold) and price, plus price-drop reminders
// for live items that haven't sold. You mark items live and sold yourself; nothing here reads or
// changes Vinted.
import { useEffect, useState } from "react";
import { Thumb, useItem, type Go } from "./App";
import { draftLabel, enqueue, useQueueVersion } from "./batch";
import { deleteItem, deleteSale, listItems, saveItem, saveSale, type Item, type ItemStatus } from "./db";
import { dateFr, euros } from "./format";
import { basePhoto, orderedPhotos } from "./photos";
import {
  daysSince,
  defaultFloor,
  dueDrops,
  priceSince,
  readDropSettings,
  repriced,
  saveDropSettings,
  snoozed,
  type DropSettings,
} from "./pricing";

const STATUS_LABEL: Record<ItemStatus, string> = { draft: "Drafts", live: "Live", sold: "Sold" };
const FILTER_KEY = "inventory-filter";

export function markedLive(item: Item, price: number, now = Date.now()): Item {
  return {
    ...item,
    status: "live",
    listedAt: now,
    listedPrice: price,
    priceHistory: [{ price, at: now }],
    floorPrice: item.floorPrice ?? defaultFloor(price, item.draft?.price_min_eur),
    snoozedUntil: undefined,
    soldAt: undefined,
    soldPrice: undefined,
  };
}

// The one-tap "I published it" on the List it screen.
export function MarkLive({ item, update, go }: { item: Item; update: (i: Item) => Promise<void>; go: Go }) {
  const price = item.draft?.price_suggested_eur ?? 0;
  if (item.status !== "draft") {
    return (
      <p className="hint">
        Marked {item.status} at {euros(item.listedPrice)}.{" "}
        <button className="link" onClick={() => go({ name: "item", id: item.id })}>
          See in inventory
        </button>
      </p>
    );
  }
  return (
    <button
      className="primary"
      onClick={async () => {
        await update(markedLive(item, price));
        go({ name: "home" });
      }}
    >
      Published on Vinted: mark live at {price} €
    </button>
  );
}

function readFilter(): ItemStatus | "all" {
  try {
    return (localStorage.getItem(FILTER_KEY) as ItemStatus | null) ?? "all";
  } catch {
    return "all";
  }
}

function subtitle(it: Item): string {
  if (it.status === "sold") return `Sold ${euros(it.soldPrice)}${it.soldAt ? ` · ${dateFr(it.soldAt)}` : ""}`;
  if (it.status === "live") return `Live ${euros(it.listedPrice)} · ${daysSince(it.listedAt ?? it.updatedAt)} d`;
  return `${draftLabel(it)} · ${it.photos.length} photos`;
}

export function Inventory({ go }: { go: Go }) {
  const [items, setItems] = useState<Item[]>();
  const [filter, setFilter] = useState(readFilter);
  const reload = () => listItems().then(setItems);
  const queue = useQueueVersion(); // batch drafts finishing in the background
  useEffect(() => {
    reload();
  }, [queue]);
  const pick = (f: ItemStatus | "all") => {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      // Not remembered; fine.
    }
  };
  if (!items) return null;
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);
  const sold = items.filter((i) => i.status === "sold" && i.soldPrice !== undefined);
  const earned = sold.reduce((n, i) => n + (i.soldPrice ?? 0), 0);

  return (
    <>
      <PriceDrops items={items} onChange={reload} go={go} />
      <div className="chips" role="tablist">
        <button className={filter === "all" ? "chip on" : "chip"} onClick={() => pick("all")}>
          All {items.length}
        </button>
        {(["draft", "live", "sold"] as const).map((s) => (
          <button key={s} className={filter === s ? "chip on" : "chip"} onClick={() => pick(s)}>
            {STATUS_LABEL[s]} {count(s)}
          </button>
        ))}
      </div>
      {filter === "sold" && sold.length > 0 && (
        <p className="hint">
          {sold.length} sold for {earned} € in total.
        </p>
      )}
      <ul className="items">
        {shown.map((it) => (
          <li key={it.id}>
            <button
              className="item"
              onClick={() =>
                go(it.status !== "draft" ? { name: "item", id: it.id } : { name: it.draft ? "review" : "capture", id: it.id })
              }
            >
              {it.photos[0] ? <Thumb blob={basePhoto(orderedPhotos(it.photos)[0])} /> : <div className="thumb empty" />}
              <span>
                <strong>{it.draft?.title || "Untitled item"}</strong>
                <small>{subtitle(it)}</small>
                {it.draftState === "failed" && <small className="error">{it.draftError}</small>}
              </span>
            </button>
            {it.draftState === "failed" && (
              <button className="retry" onClick={() => enqueue(it.id)}>
                Retry draft
              </button>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="hint">Nothing here yet.</p>}
    </>
  );
}

function PriceDrops({ items, onChange, go }: { items: Item[]; onChange: () => void; go: Go }) {
  const settings = readDropSettings();
  const due = dueDrops(items, settings);
  if (due.length === 0) return null;
  return (
    <section className="drops">
      <h2>Needs a price drop</h2>
      <p className="hint">
        Live {settings.afterDays}+ days at the same price. Lower it on Vinted, then confirm here.
      </p>
      {due.map(({ item, days, suggested }) => (
        <DropRow key={item.id} item={item} days={days} suggested={suggested} settings={settings} onChange={onChange} go={go} />
      ))}
    </section>
  );
}

function DropRow(props: { item: Item; days: number; suggested: number; settings: DropSettings; onChange: () => void; go: Go }) {
  const { item, days, suggested, settings, onChange, go } = props;
  const [price, setPrice] = useState(String(suggested));
  const save = async (next: Item) => {
    await saveItem(next);
    onChange();
  };
  const value = Number(price);
  const valid = value > 0 && value < (item.listedPrice ?? Infinity);
  return (
    <div className="drop">
      <button className="item" onClick={() => go({ name: "item", id: item.id })}>
        {item.photos[0] ? <Thumb blob={basePhoto(orderedPhotos(item.photos)[0])} /> : <div className="thumb empty" />}
        <span>
          <strong>{item.draft?.title || "Untitled item"}</strong>
          <small>
            {euros(item.listedPrice)} for {days} days · suggest {suggested} €
            {item.floorPrice !== undefined && ` (floor ${item.floorPrice} €)`}
          </small>
        </span>
      </button>
      <div className="drop-actions">
        <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="New price" />
        <button className="primary" disabled={!valid} onClick={() => save(repriced(item, value))}>
          I lowered it
        </button>
        <button onClick={() => save(snoozed(item, settings))}>Not yet</button>
      </div>
      {item.vintedUrl && (
        <a href={item.vintedUrl} target="_blank" rel="noreferrer">
          Open on vinted.fr
        </a>
      )}
    </div>
  );
}

// Inventory card for one live or sold item.
export function ItemPage({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [selling, setSelling] = useState(false);
  const [soldPrice, setSoldPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  if (!item) return null;
  const d = item.draft;
  const history = item.priceHistory ?? [];

  const sell = async () => {
    const price = Number(soldPrice);
    if (!(price > 0)) return;
    const now = Date.now();
    await update({ ...item, status: "sold", soldAt: now, soldPrice: price, snoozedUntil: undefined });
    await saveSale({
      itemId: item.id,
      title: d?.title ?? "",
      brand: d?.brand ?? "",
      category_path: d?.category_path ?? "",
      size: d?.size ?? "",
      condition: d?.condition ?? "",
      firstPrice: history[0]?.price ?? item.listedPrice ?? price,
      listedPrice: item.listedPrice ?? price,
      soldPrice: price,
      listedAt: item.listedAt ?? item.createdAt,
      soldAt: now,
    });
    setSelling(false);
  };

  const setStatus = async (status: ItemStatus) => {
    if (item.status === "sold") await deleteSale(item.id);
    if (status === "live") await update({ ...item, status, soldAt: undefined, soldPrice: undefined });
    else await update({ ...item, status });
  };

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "home" })}>
          ‹ Items
        </button>
        <h1>{STATUS_LABEL[item.status].replace(/s$/, "")}</h1>
      </header>
      <div className="thumbs">
        {orderedPhotos(item.photos)
          .slice(0, 4)
          .map((p) => (
            <Thumb key={p.id} blob={basePhoto(p)} />
          ))}
      </div>
      <h2 className="item-title">{d?.title || "Untitled item"}</h2>
      <table>
        <tbody>
          {item.status === "sold" && (
            <tr>
              <th>Sold</th>
              <td>
                {euros(item.soldPrice)}
                {item.soldAt && ` on ${dateFr(item.soldAt)}`}
              </td>
            </tr>
          )}
          <tr>
            <th>Price</th>
            <td>
              {euros(item.listedPrice)}
              {item.status === "live" && ` for ${daysSince(priceSince(item))} days`}
            </td>
          </tr>
          {item.listedAt && (
            <tr>
              <th>Live since</th>
              <td>{dateFr(item.listedAt)}</td>
            </tr>
          )}
          {history.length > 1 && (
            <tr>
              <th>Prices</th>
              <td>{history.map((h) => `${h.price} € (${dateFr(h.at)})`).join(" → ")}</td>
            </tr>
          )}
        </tbody>
      </table>

      {item.status === "live" && (
        <>
          <div className="grid">
            <label>
              Floor (€)
              <input
                type="number"
                inputMode="decimal"
                value={item.floorPrice ?? ""}
                onChange={(e) => update({ ...item, floorPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </label>
            <label>
              Changed price (€)
              <input
                type="number"
                inputMode="decimal"
                value={newPrice}
                placeholder={String(item.listedPrice ?? "")}
                onChange={(e) => setNewPrice(e.target.value)}
                onBlur={async () => {
                  const p = Number(newPrice);
                  if (p > 0 && p !== item.listedPrice) await update(repriced(item, p));
                  setNewPrice("");
                }}
              />
            </label>
          </div>
          <p className="hint">Price drops never suggest below the floor. Change the price on Vinted first, then here.</p>
          <label>
            Vinted link (optional)
            <input
              type="url"
              value={item.vintedUrl ?? ""}
              placeholder="https://www.vinted.fr/items/…"
              onChange={(e) => update({ ...item, vintedUrl: e.target.value.trim() || undefined })}
            />
          </label>
          {selling ? (
            <div className="actions">
              <input
                type="number"
                inputMode="decimal"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                aria-label="Sold for (€)"
                autoFocus
              />
              <button className="primary" disabled={!(Number(soldPrice) > 0)} onClick={sell}>
                Sold for {soldPrice || "…"} €
              </button>
              <button onClick={() => setSelling(false)}>Cancel</button>
            </div>
          ) : (
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  setSoldPrice(String(item.listedPrice ?? ""));
                  setSelling(true);
                }}
              >
                Mark as sold
              </button>
              {item.vintedUrl && (
                <a className="button" href={item.vintedUrl} target="_blank" rel="noreferrer">
                  Open on vinted.fr
                </a>
              )}
            </div>
          )}
        </>
      )}

      <div className="actions">
        {item.status === "sold" && <button onClick={() => setStatus("live")}>Not sold after all</button>}
        {item.status === "live" && <button onClick={() => setStatus("draft")}>Back to draft</button>}
        {d && <button onClick={() => go({ name: "review", id })}>Edit listing</button>}
        {d && <button onClick={() => go({ name: "replies", id })}>Buyer replies</button>}
        <button
          className="danger"
          onClick={async () => {
            if (confirm("Delete this item and its photos from the phone? A recorded sale price is kept.")) {
              await deleteItem(item.id);
              go({ name: "home" });
            }
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}

// Reminder settings, shown in Settings. Saved as you type.
export function DropSettingsFields() {
  const [s, setS] = useState(readDropSettings);
  const set = (patch: Partial<DropSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveDropSettings(next);
  };
  const num = (v: string, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
  return (
    <div className="grid">
      <label>
        Price drop after (days)
        <input type="number" inputMode="numeric" value={s.afterDays} onChange={(e) => set({ afterDays: num(e.target.value, s.afterDays) })} />
      </label>
      <label>
        Suggested drop (%)
        <input type="number" inputMode="numeric" value={s.percent} onChange={(e) => set({ percent: num(e.target.value, s.percent) })} />
      </label>
    </div>
  );
}
