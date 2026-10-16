// Buyer replies: per-item French answers to copy into Vinted's chat. Copy only, never sent from here.
import { useState } from "react";
import { CopyButton, useItem, type Go } from "./App";
import {
  buildReplies,
  measureNames,
  readReplySettings,
  saveReplySettings,
  type ItemWithMeasures,
  type ReplySettings,
} from "./replies";

export function Replies({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [settings] = useState(readReplySettings);
  if (!item?.draft) return null;
  const it = item as ItemWithMeasures;
  const values = it.measurements ?? {};
  const setMeasure = (name: string, value: string) =>
    update((cur) => {
      const c = cur as ItemWithMeasures;
      return { ...c, measurements: { ...c.measurements, [name]: value } };
    });

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Draft
        </button>
        <h1>Buyer replies</h1>
      </header>
      <p className="hint">
        Copy a reply, then paste it in the Vinted chat and send it yourself. Discount, shipping and tu/vous are in{" "}
        <button className="link" onClick={() => go({ name: "settings" })}>
          Settings
        </button>
        .
      </p>
      <section className="measures">
        <p>
          <strong>Measurements (cm, flat)</strong>
        </p>
        <div className="grid">
          {measureNames(item).map((name) => (
            <label key={name}>
              {name}
              <input
                inputMode="decimal"
                value={values[name] ?? ""}
                onChange={(e) => setMeasure(name, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>
      {buildReplies(it, settings).map((r) => (
        <section key={r.key} className="reply">
          <div className="reply-head">
            <strong>{r.label}</strong>
            <CopyButton text={r.text} label="Copy" />
          </div>
          <p className="reply-text">{r.text}</p>
          {r.incomplete && <p className="warn">{r.incomplete}</p>}
        </section>
      ))}
    </>
  );
}

export function ReplySettingsFields() {
  const [s, setS] = useState(readReplySettings);
  const set = (patch: Partial<ReplySettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveReplySettings(next);
  };
  const pct = (v: string) => Math.min(90, Math.max(0, Math.round(Number(v) || 0)));
  return (
    <section>
      <h2 className="or">Buyer replies</h2>
      <label className="inline">
        <input type="checkbox" checked={s.tutoie} onChange={(e) => set({ tutoie: e.target.checked })} />
        Use "tu" with buyers (otherwise "vous")
      </label>
      <div className="grid">
        <label>
          Bundle discount (%)
          <input type="number" inputMode="numeric" value={s.bundlePct} onChange={(e) => set({ bundlePct: pct(e.target.value) })} />
        </label>
        <label>
          Lowest offer (% off)
          <input
            type="number"
            inputMode="numeric"
            value={s.offerFloorPct}
            onChange={(e) => set({ offerFloorPct: pct(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Ships within
        <input value={s.shipDays} onChange={(e) => set({ shipDays: e.target.value })} />
      </label>
      <label>
        Shipping note
        <input value={s.shippingNote} onChange={(e) => set({ shippingNote: e.target.value })} />
      </label>
      <label>
        Signature (optional)
        <input value={s.signature} placeholder="e.g. Victor" onChange={(e) => set({ signature: e.target.value })} />
      </label>
      <p className="hint">Saved on this phone as you type.</p>
    </section>
  );
}
