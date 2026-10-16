// "Fill on vinted.fr": sends the listing to /api/handoff, copies the returned link, and opens
// vinted.fr's plain sell page. The Annonces userscript there reads the link from the clipboard
// when you tap "Fill the form". The link never goes into a Vinted address, so Vinted's pages
// and app never see it.
import { useState } from "react";
import { AI_NOTICE, type HandoffPackage } from "../shared/listing";
import { readToken } from "./App";
import type { Item } from "./db";
import { hasAiImages, listingPhotos, toBase64 } from "./photos";

const SELL_URL = "https://www.vinted.fr/items/new";

export function listingDescription(item: Item): string {
  const text = item.draft?.description.trim() ?? "";
  return hasAiImages(item.photos) && !text.includes(AI_NOTICE) ? `${text}\n\n${AI_NOTICE}` : text;
}

async function buildPackage(item: Item): Promise<HandoffPackage> {
  const d = item.draft!;
  return {
    listing: {
      title: d.title,
      description: listingDescription(item),
      price: d.price_suggested_eur,
      brand: d.brand,
      size: d.size,
      condition: d.condition,
      colours: d.colours,
      materials: d.materials,
      category_path: d.category_path,
    },
    photos: await Promise.all(listingPhotos(item.photos).map(({ blob }) => toBase64(blob))),
  };
}

export function VintedSend({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  const send = async () => {
    setBusy(true);
    setError("");
    setLink("");
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-token": readToken() },
        body: JSON.stringify(await buildPackage(item)),
      });
      const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
      if (!res.ok) throw new Error(body.error || `Server answered ${res.status}`);
      setLink(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Runs inside the tap, which iPhone requires for writing to the clipboard.
  const copy = () => navigator.clipboard.writeText(link).catch(() => prompt("Copy this link:", link));

  return (
    <section className="vinted-send">
      <p>
        <strong>Fill on vinted.fr</strong> (needs the Annonces script, see README). It types every field and adds the
        photos; you check and press publish.
      </p>
      {!link ? (
        <button className="primary" disabled={busy} onClick={send}>
          {busy ? "Sending…" : "Send to vinted.fr"}
        </button>
      ) : (
        <>
          <div className="actions">
            <a className="button primary" href={SELL_URL} target="_blank" rel="noreferrer" onClick={copy}>
              Copy link and open vinted.fr
            </a>
          </div>
          <p className="hint">
            In vinted.fr, tap <strong>Fill the form</strong> in the Annonces panel and allow Paste. If the Vinted app
            opens instead, open {SELL_URL.replace("https://", "")} in your browser yourself; the link stays copied for one
            hour.
          </p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
