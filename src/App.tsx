import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLOURS,
  CONDITIONS,
  MAX_PHOTOS,
  SHOTS,
  type Draft,
  type ShotKind,
} from "../shared/listing";
import { cleanLegacyFields, deleteItem, getItem, listItems, newItem, saveItem, type Item, type Photo } from "./db";
import { VintedSend } from "./VintedSend";
import { IMPROVABLE, autoFix, listingDescription, listingPhotos, orderedPhotos, photoFiles, resizeToJpeg } from "./photos";
import { Studio } from "./Studio";
import { ModelSetup } from "./ModelSetup";
import { DropSettingsFields, Inventory, ItemPage, MarkLive } from "./Inventory";
import { enqueue, requestDraft, resumeQueue, useQueueVersion } from "./batch";
import { useGeminiVersion } from "./gemini";
import { Replies, ReplySettingsFields } from "./Replies";
import { BackupBanner, BackupSection } from "./BackupSection";
import { BottomNav, TOP_LEVEL } from "./BottomNav";
import { Pro } from "./ProScreen";
import { Sales } from "./SalesScreen";
import { Stats } from "./StatsScreen";
import { CATEGORY_PATHS } from "../shared/vinted-catalog";

export type Screen =
  | { name: "home" | "settings" | "sales" | "stats" | "pro" }
  | { name: "model"; back: Screen }
  | { name: "capture" | "review" | "studio" | "handoff" | "item" | "replies"; id: string; batch?: boolean };

const TOKEN_KEY = "app-token";
export function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    void cleanLegacyFields().catch(() => {}); // best effort; it retries at the next start
    void resumeQueue();
    const onBlocked = () => setBlocked(true);
    window.addEventListener("va:db-blocked", onBlocked);
    return () => window.removeEventListener("va:db-blocked", onBlocked);
  }, []);
  return (
    <main className={TOP_LEVEL.includes(screen.name) ? "with-nav" : undefined}>
      {blocked && <p className="warn">Another tab of this app is open. Close it, then reload this page.</p>}
      {screen.name === "home" && <Home go={setScreen} />}
      {screen.name === "settings" && <Settings go={setScreen} />}
      {screen.name === "sales" && <Sales go={setScreen} />}
      {screen.name === "stats" && <Stats go={setScreen} />}
      {screen.name === "pro" && <Pro />}
      {screen.name === "capture" && <Capture key={screen.id} id={screen.id} batch={screen.batch} go={setScreen} />}
      {screen.name === "review" && <Review id={screen.id} go={setScreen} />}
      {screen.name === "studio" && <Studio id={screen.id} go={setScreen} />}
      {screen.name === "model" && <ModelSetup onBack={() => setScreen(screen.back)} />}
      {screen.name === "handoff" && <Handoff id={screen.id} go={setScreen} />}
      {screen.name === "item" && <ItemPage id={screen.id} go={setScreen} />}
      {screen.name === "replies" && <Replies id={screen.id} go={setScreen} />}
      {TOP_LEVEL.includes(screen.name) && <BottomNav screen={screen} go={setScreen} />}
    </main>
  );
}

export type Go = (s: Screen) => void;

// update() takes a new item or a function of the latest one, so quick
// successive photo adds don't overwrite each other.
export function useItem(id: string): [Item | undefined, (next: Item | ((cur: Item) => Item)) => Promise<void>] {
  const [item, setItem] = useState<Item>();
  const latest = useRef<Item>(undefined);
  // Also reloads when the batch queue writes to items, so a background draft isn't overwritten,
  // and when the Mac extension writes a Gemini-automated "on model" photo straight to IndexedDB.
  const queue = useQueueVersion();
  const gemini = useGeminiVersion();
  useEffect(() => {
    getItem(id).then((i) => {
      latest.current = i;
      setItem(i);
    });
  }, [id, queue, gemini]);
  const update = async (next: Item | ((cur: Item) => Item)) => {
    const value = typeof next === "function" ? next(latest.current!) : next;
    latest.current = value;
    setItem(value);
    await saveItem(value);
  };
  return [item, update];
}

function useObjectUrl(blob: Blob): string {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

export function Thumb({ blob, onRemove }: { blob: Blob; onRemove?: () => void }) {
  const url = useObjectUrl(blob);
  return (
    <div className="thumb">
      <img src={url} alt="" />
      {onRemove && (
        <button className="remove" onClick={onRemove} aria-label="Remove photo">
          ×
        </button>
      )}
    </div>
  );
}

function Home({ go }: { go: Go }) {
  const start = async (batch?: boolean) => {
    const item = newItem();
    await saveItem(item);
    go({ name: "capture", id: item.id, batch });
  };
  return (
    <>
      <header>
        <h1>Annonces</h1>
      </header>
      {!readToken() && (
        <p className="warn">
          Add your app token in <button className="link" onClick={() => go({ name: "settings" })}>Settings</button> before
          drafting.
        </p>
      )}
      <BackupBanner go={go} />
      <div className="actions">
        <button className="primary big" onClick={() => start()}>
          New item
        </button>
        <button className="big" onClick={() => start(true)}>
          Batch
        </button>
      </div>
      <p className="hint">Batch: photograph several items in a row; each one drafts in the background.</p>
      <Inventory go={go} />
    </>
  );
}

function Settings({ go }: { go: Go }) {
  const [token, setToken] = useState(readToken);
  const [saved, setSaved] = useState(false);
  const save = () => {
    try {
      localStorage.setItem(TOKEN_KEY, token.trim());
      setSaved(true);
    } catch {
      alert("This browser blocked local storage, so the token could not be saved.");
    }
  };
  return (
    <>
      <header>
        <h1>Settings</h1>
      </header>
      <label>
        App token
        <input
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
          autoComplete="off"
        />
      </label>
      <p className="hint">The same value as APP_TOKEN in Cloudflare. It stays on this phone.</p>
      <DropSettingsFields />
      <div className="actions">
        <button className="primary" onClick={save}>
          {saved ? "Saved ✓" : "Save"}
        </button>
        <button onClick={() => go({ name: "model", back: { name: "settings" } })}>My model</button>
      </div>
      <ReplySettingsFields />
      <BackupSection />
    </>
  );
}

function Capture({ id, batch, go }: { id: string; batch?: boolean; go: Go }) {
  const [item, update] = useItem(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!item) return null;

  const add = async (kind: ShotKind, files: FileList | null) => {
    if (!files?.length) return;
    const photos = await Promise.all(
      Array.from(files).map(async (f, i): Promise<Photo> => {
        const blob = await resizeToJpeg(f);
        // Whole-garment shots get the automatic exposure and colour fix; labels and defects stay as shot.
        const fixed = IMPROVABLE.includes(kind) ? await autoFix(blob).catch(() => null) : null;
        return { id: crypto.randomUUID(), kind, blob, addedAt: Date.now() + i, ...(fixed && { fixed, useFixed: true }) };
      }),
    );
    await update((cur) => ({ ...cur, photos: [...cur.photos, ...photos].slice(0, MAX_PHOTOS) }));
  };
  const remove = (photoId: string) =>
    update((cur) => ({ ...cur, photos: cur.photos.filter((p) => p.id !== photoId) }));
  // Switching between the fix and the original drops any studio version made from the other one.
  const toggleFix = (photoId: string) =>
    update((cur) => ({
      ...cur,
      photos: cur.photos.map((p) =>
        p.id === photoId
          ? {
              ...p,
              useFixed: !p.useFixed,
              improved: undefined,
              useImproved: undefined,
            }
          : p,
      ),
    }));

  const missing = SHOTS.filter((s) => s.required && !item.photos.some((p) => p.kind === s.kind));

  const draft = async () => {
    setBusy(true);
    setError("");
    try {
      const { draft, model, usage } = await requestDraft(item);
      await update({ ...item, draft, draftModel: model, draftTokens: usage, draftState: undefined, draftError: undefined });
      go({ name: "review", id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Batch: queue this item for background drafting and start the next one straight away.
  const queueAndNext = async () => {
    await enqueue(id);
    const next = newItem();
    await saveItem(next);
    go({ name: "capture", id: next.id, batch: true });
  };
  const finishBatch = async () => {
    if (item.photos.length) await enqueue(id);
    else await deleteItem(id);
    go({ name: "home" });
  };
  const queued = item.draftState === "queued" || item.draftState === "drafting";

  return (
    <>
      <header>
        <button className="link" onClick={() => (batch ? finishBatch() : go({ name: "home" }))}>
          ‹ Items
        </button>
        <h1>{batch ? "Batch photos" : "Photos"}</h1>
        <span className="count">
          {item.photos.length}/{MAX_PHOTOS}
        </span>
      </header>
      {SHOTS.map((s) => {
        const shots = item.photos.filter((p) => p.kind === s.kind);
        return (
          <section key={s.kind} className="shot">
            <div className="shot-head">
              <span className={shots.length ? "tick done" : s.required ? "tick" : "tick optional"}>
                {shots.length ? "✓" : ""}
              </span>
              <span>
                <strong>{s.label}</strong>
                {!s.required && <em> optional</em>}
                <small>{s.hint}</small>
              </span>
              <label className="add">
                Add
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => {
                    add(s.kind, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {shots.length > 0 && (
              <div className="thumbs">
                {shots.map((p) =>
                  p.fixed ? (
                    <figure key={p.id} className="fix">
                      <Thumb blob={p.useFixed ? p.fixed : p.blob} onRemove={() => remove(p.id)} />
                      <button className="link" onClick={() => toggleFix(p.id)}>
                        {p.useFixed ? "Auto-fixed ✓" : "Original"}
                      </button>
                    </figure>
                  ) : (
                    <Thumb key={p.id} blob={p.blob} onRemove={() => remove(p.id)} />
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
      <label>
        Notes for the draft (optional)
        <textarea
          rows={3}
          value={item.notes}
          placeholder="e.g. worn twice, true to size, small mark inside the collar"
          onChange={(e) => update((cur) => ({ ...cur, notes: e.target.value }))}
        />
      </label>
      <label>
        Bought for (€, optional)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={item.costPrice ?? ""}
          onChange={(e) => {
            const costPrice = e.target.value === "" ? undefined : Number(e.target.value);
            void update((cur) => ({ ...cur, costPrice }));
          }}
        />
      </label>
      {item.photos.some((p) => p.fixed) && (
        <p className="hint">
          Front, back and detail photos get an automatic light and colour fix. Nothing is redrawn. Tap "Auto-fixed ✓"
          to use the original instead.
        </p>
      )}
      {missing.length > 0 && <p className="hint">Still missing: {missing.map((m) => m.label).join(", ")}.</p>}
      {error && <p className="error">{error}</p>}
      {batch && <BatchStatus />}
      {batch ? (
        <div className="actions">
          <button className="primary" disabled={item.photos.length === 0} onClick={queueAndNext}>
            Draft in background, next item
          </button>
          <button onClick={finishBatch}>{item.photos.length ? "Draft this, finish batch" : "Finish batch"}</button>
        </div>
      ) : (
        <div className="actions">
          <button className="primary" disabled={busy || queued || item.photos.length === 0} onClick={draft}>
            {busy || queued ? "Drafting…" : item.draft ? "Redraft listing" : "Draft listing"}
          </button>
          {item.draft && (
            <button onClick={() => go({ name: "review", id })} disabled={busy}>
              Back to draft
            </button>
          )}
        </div>
      )}
    </>
  );
}

// One line under the batch capture screen: how the background drafts are doing.
function BatchStatus() {
  const queue = useQueueVersion();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    listItems().then(setItems);
  }, [queue]);
  const count = (s: Item["draftState"]) => items.filter((i) => i.draftState === s).length;
  const [waiting, drafting, failed] = [count("queued"), count("drafting"), count("failed")];
  if (!waiting && !drafting && !failed) return null;
  return (
    <p className="hint">
      In the background: {drafting ? "1 drafting" : ""}
      {waiting ? `${drafting ? ", " : ""}${waiting} waiting` : ""}
      {failed ? `${drafting || waiting ? ", " : ""}${failed} failed (retry from Items)` : ""}.
    </p>
  );
}

function Review({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  if (!item?.draft) return null;
  const d = item.draft;
  const unsure = (f: keyof Draft) => (d.unsure_fields.includes(f) ? "unsure" : "");
  const set = (patch: Partial<Draft>) => update({ ...item, draft: { ...d, ...patch } });
  const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "capture", id })}>
          ‹ Photos
        </button>
        <h1>Review</h1>
      </header>
      {d.unsure_fields.length > 0 && (
        <p className="warn">Check the highlighted fields: they were guessed, not read from a label.</p>
      )}
      <label className={unsure("title")}>
        Titre <small>{d.title.length} car.</small>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className={unsure("description")}>
        Description
        <textarea rows={8} value={d.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="grid">
        <label className={unsure("brand")}>
          Marque
          <input value={d.brand} onChange={(e) => set({ brand: e.target.value })} />
        </label>
        <label className={unsure("size")}>
          Taille
          <input value={d.size} onChange={(e) => set({ size: e.target.value })} />
        </label>
      </div>
      <label className={unsure("category_path")}>
        Catégorie
        <input list="vinted-categories" value={d.category_path} onChange={(e) => set({ category_path: e.target.value })} />
        <datalist id="vinted-categories">
          {CATEGORY_PATHS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <div className="grid">
        <label className={unsure("condition")}>
          État
          <select value={d.condition} onChange={(e) => set({ condition: e.target.value as Draft["condition"] })}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={unsure("colours")}>
          Couleur
          <select
            value={d.colours[0] ?? ""}
            onChange={(e) => set({ colours: [e.target.value, ...d.colours.slice(1)].filter(Boolean) })}
          >
            <option value="">—</option>
            {COLOURS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={unsure("materials")}>
        Matière
        <input value={d.materials} onChange={(e) => set({ materials: e.target.value })} />
      </label>
      <label>
        Défauts (one per line)
        <textarea rows={3} value={d.defects.join("\n")} onChange={(e) => set({ defects: lines(e.target.value) })} />
      </label>
      <label>
        Mesures à prendre (one per line)
        <textarea
          rows={3}
          value={d.measurements_to_take.join("\n")}
          onChange={(e) => set({ measurements_to_take: lines(e.target.value) })}
        />
      </label>
      <section className="price">
        <label>
          Prix (€)
          <input
            type="number"
            inputMode="decimal"
            value={d.price_suggested_eur}
            onChange={(e) => set({ price_suggested_eur: Number(e.target.value) })}
          />
        </label>
        <p className="hint">
          Range {d.price_min_eur}–{d.price_max_eur} €. {d.price_reasoning}{" "}
          <a href={`https://www.vinted.fr/catalog?search_text=${encodeURIComponent(d.search_query)}`} target="_blank" rel="noreferrer">
            Compare on vinted.fr
          </a>
        </p>
      </section>
      {item.draftTokens && (
        <p className="hint">
          Drafted by {item.draftModel}, {item.draftTokens.input_tokens} in / {item.draftTokens.output_tokens} out tokens.
        </p>
      )}
      <div className="actions">
        <button className="primary" onClick={() => go({ name: "studio", id })}>
          Next: photos
        </button>
        <button onClick={() => go({ name: "replies", id })}>Buyer replies</button>
      </div>
    </>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      prompt("Copy this:", text);
    }
  };
  return <button onClick={copy}>{done ? "Copied ✓" : label}</button>;
}

function Handoff({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [shared, setShared] = useState("");
  if (!item?.draft) return null;
  const d = item.draft;
  const files = photoFiles(item.photos, (d.brand || "article").toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  const savePhotos = async () => {
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        setShared("Photos shared. On iPhone choose Save Images; then pick them in Vinted in this order.");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    for (const f of files) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    setShared("Photos downloaded, numbered in listing order.");
  };

  const rows: [string, string][] = [
    ["Catégorie", d.category_path],
    ["Marque", d.brand],
    ["Taille", d.size],
    ["État", d.condition],
    ["Couleur", d.colours.join(", ")],
    ["Matière", d.materials],
    ["Prix", `${d.price_suggested_eur} €`],
  ];

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "studio", id })}>
          ‹ Photos
        </button>
        <h1>List it</h1>
      </header>
      <VintedSend item={item}>
        <MarkLive item={item} update={update} go={go} />
      </VintedSend>
      <h2 className="or">Or by hand</h2>
      <ol className="steps">
        <li>
          <button className="primary" onClick={savePhotos}>
            Save {files.length} {files.length === 1 ? "photo" : "photos"}
          </button>
          {shared && <p className="hint">{shared}</p>}
          <div className="thumbs">
            {listingPhotos(item.photos).map(({ photo, blob }) => (
              <Thumb key={photo.id} blob={blob} />
            ))}
          </div>
        </li>
        <li>
          <a className="button primary" href="https://www.vinted.fr/items/new" target="_blank" rel="noreferrer">
            Open Vinted
          </a>
          <p className="hint">Add the photos in the order shown, front first.</p>
        </li>
        <li>
          <div className="actions">
            <CopyButton text={d.title} label="Copy title" />
            <CopyButton text={listingDescription(d.description, item.photos)} label="Copy description" />
          </div>
        </li>
        <li>
          <p>Tap these in the Vinted form:</p>
          <table>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
        <li>
          <p>Check everything in Vinted, then press publish there.</p>
          <div className="actions">
            <MarkLive item={item} update={update} go={go} />
            <button
              className="danger"
              onClick={async () => {
                if (confirm("Delete this item and its photos from the phone?")) {
                  await deleteItem(item.id);
                  go({ name: "home" });
                }
              }}
            >
              Delete
            </button>
          </div>
        </li>
      </ol>
    </>
  );
}
