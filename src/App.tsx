import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLOURS,
  CONDITIONS,
  MAX_PHOTOS,
  MAX_PHOTOS_TO_CLAUDE,
  SHOTS,
  type Draft,
  type DraftResponse,
  type ShotKind,
} from "../shared/listing";
import { deleteItem, getItem, listItems, newItem, saveItem, type Item } from "./db";
import { orderedPhotos, photoFiles, resizeToJpeg, toDraftImages } from "./photos";

type Screen = { name: "home" } | { name: "settings" } | { name: "capture" | "review" | "handoff"; id: string };

const TOKEN_KEY = "app-token";
function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  return (
    <main>
      {screen.name === "home" && <Home go={setScreen} />}
      {screen.name === "settings" && <Settings go={setScreen} />}
      {screen.name === "capture" && <Capture id={screen.id} go={setScreen} />}
      {screen.name === "review" && <Review id={screen.id} go={setScreen} />}
      {screen.name === "handoff" && <Handoff id={screen.id} go={setScreen} />}
    </main>
  );
}

type Go = (s: Screen) => void;

// update() takes a new item or a function of the latest one, so quick
// successive photo adds don't overwrite each other.
function useItem(id: string): [Item | undefined, (next: Item | ((cur: Item) => Item)) => Promise<void>] {
  const [item, setItem] = useState<Item>();
  const latest = useRef<Item>(undefined);
  useEffect(() => {
    getItem(id).then((i) => {
      latest.current = i;
      setItem(i);
    });
  }, [id]);
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

function Thumb({ blob, onRemove }: { blob: Blob; onRemove?: () => void }) {
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
  const [items, setItems] = useState<Item[]>();
  useEffect(() => {
    listItems().then(setItems);
  }, []);
  const start = async () => {
    const item = newItem();
    await saveItem(item);
    go({ name: "capture", id: item.id });
  };
  return (
    <>
      <header>
        <h1>Annonces</h1>
        <button className="link" onClick={() => go({ name: "settings" })}>
          Settings
        </button>
      </header>
      {!readToken() && (
        <p className="warn">
          Add your app token in <button className="link" onClick={() => go({ name: "settings" })}>Settings</button> before
          drafting.
        </p>
      )}
      <button className="primary big" onClick={start}>
        New item
      </button>
      <ul className="items">
        {items?.map((it) => (
          <li key={it.id}>
            <button
              className="item"
              onClick={() => go({ name: it.draft ? "review" : "capture", id: it.id })}
            >
              {it.photos[0] ? <Thumb blob={orderedPhotos(it.photos)[0].blob} /> : <div className="thumb empty" />}
              <span>
                <strong>{it.draft?.title || "Untitled item"}</strong>
                <small>
                  {it.status === "listed" ? `Listed · ${it.listedPrice ?? "?"} €` : it.draft ? "Draft ready" : "Photos"} ·{" "}
                  {it.photos.length} photos
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Settings({ go }: { go: Go }) {
  const [token, setToken] = useState(readToken);
  const save = () => {
    try {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } catch {
      alert("This browser blocked local storage, so the token could not be saved.");
    }
    go({ name: "home" });
  };
  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "home" })}>
          ‹ Back
        </button>
        <h1>Settings</h1>
      </header>
      <label>
        App token
        <input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </label>
      <p className="hint">The same value as APP_TOKEN in Cloudflare. It stays on this phone.</p>
      <button className="primary" onClick={save}>
        Save
      </button>
    </>
  );
}

function Capture({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!item) return null;

  const add = async (kind: ShotKind, files: FileList | null) => {
    if (!files?.length) return;
    const photos = await Promise.all(
      Array.from(files).map(async (f, i) => ({
        id: crypto.randomUUID(),
        kind,
        blob: await resizeToJpeg(f),
        addedAt: Date.now() + i,
      })),
    );
    await update((cur) => ({ ...cur, photos: [...cur.photos, ...photos].slice(0, MAX_PHOTOS) }));
  };
  const remove = (photoId: string) =>
    update((cur) => ({ ...cur, photos: cur.photos.filter((p) => p.id !== photoId) }));

  const missing = SHOTS.filter((s) => s.required && !item.photos.some((p) => p.kind === s.kind));

  const draft = async () => {
    setBusy(true);
    setError("");
    try {
      const images = (await toDraftImages(item.photos)).slice(0, MAX_PHOTOS_TO_CLAUDE);
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-token": readToken() },
        body: JSON.stringify({ images, notes: item.notes }),
      });
      const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
      if (!res.ok) throw new Error(body.error || `Server answered ${res.status}`);
      const { draft, model, usage } = body as DraftResponse;
      await update({ ...item, draft, draftModel: model, draftTokens: usage });
      go({ name: "review", id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "home" })}>
          ‹ Items
        </button>
        <h1>Photos</h1>
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
                {shots.map((p) => (
                  <Thumb key={p.id} blob={p.blob} onRemove={() => remove(p.id)} />
                ))}
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
      {missing.length > 0 && <p className="hint">Still missing: {missing.map((m) => m.label).join(", ")}.</p>}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || item.photos.length === 0} onClick={draft}>
          {busy ? "Drafting…" : item.draft ? "Redraft listing" : "Draft listing"}
        </button>
        {item.draft && (
          <button onClick={() => go({ name: "review", id })} disabled={busy}>
            Back to draft
          </button>
        )}
      </div>
    </>
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
        <input value={d.category_path} onChange={(e) => set({ category_path: e.target.value })} />
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
        <button className="primary" onClick={() => go({ name: "handoff", id })}>
          Ready to list
        </button>
      </div>
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
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
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Review
        </button>
        <h1>List it</h1>
      </header>
      <ol className="steps">
        <li>
          <button className="primary" onClick={savePhotos}>
            Save {files.length} {files.length === 1 ? "photo" : "photos"}
          </button>
          {shared && <p className="hint">{shared}</p>}
          <div className="thumbs">
            {orderedPhotos(item.photos).map((p) => (
              <Thumb key={p.id} blob={p.blob} />
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
            <CopyButton text={d.description} label="Copy description" />
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
            <button
              onClick={async () => {
                await update({ ...item, status: "listed", listedPrice: d.price_suggested_eur });
                go({ name: "home" });
              }}
            >
              Mark as listed
            </button>
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
