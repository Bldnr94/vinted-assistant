// Backup export/import in Settings, and the reminder banner on Home. The logic lives in backup.ts.
import { useEffect, useState } from "react";
import type { Go } from "./App";
import { hasRoomFor, lastBackupAt, localRows, parseBackup, restoreBackup, saveBackup, type ParsedBackup } from "./backup";
import { pauseQueue, unpauseQueue } from "./batch";
import { listItems } from "./db";
import { dateLong as longDate } from "./format";

const counts = (r: { items: unknown[]; sales: unknown[]; poses: unknown[] }) =>
  `${r.items.length} items, ${r.sales.length} sales, ${r.poses.length} model photos`;

export function BackupSection() {
  const [last, setLast] = useState(lastBackupAt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ParsedBackup>();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportNow = () =>
    run(async () => {
      const result = await saveBackup();
      setLast(lastBackupAt());
      if (result === "saved") setMessage("Backup saved. Keep the file somewhere other than this device (Files, iCloud, a cloud drive).");
    });

  const pick = (file?: File) =>
    file &&
    run(async () => {
      setPending(await parseBackup(file));
    });

  const restore = (mode: "merge" | "replace") =>
    run(async () => {
      if (!pending) return;
      if (mode === "replace") {
        if (!(await hasRoomFor(pending.fileSize))) throw new Error("There is not enough free storage on this device to restore this backup.");
        if (!confirm("Replace everything on this device with this backup? A copy of your current data is saved first.")) return;
        const current = await localRows();
        if (current.items.length + current.sales.length + current.poses.length > 0) {
          if ((await saveBackup()) === "cancelled") {
            throw new Error("Nothing was replaced: the safety copy of your current data was not saved.");
          }
        }
      }
      setMessage("Waiting for any background draft to finish…");
      await pauseQueue();
      try {
        await restoreBackup(pending, mode);
      } catch (e) {
        unpauseQueue();
        throw e;
      }
      location.reload();
    });

  return (
    <>
      <h2 className="or">Backup</h2>
      <p className="hint">
        Your items, photos and sales live only in this browser; clearing site data or a storage clean-up would erase them.{" "}
        {last ? `Last backup: ${longDate(last)}.` : "No backup yet."}
      </p>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={exportNow}>
          Export backup
        </button>
        <label className="button upload">
          Import backup…
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="warn">
          <p>
            Backup from {longDate(pending.exportedAt)}: {counts(pending)}.
          </p>
          <p>
            <b>Merge</b> adds what is missing and keeps the newer version of each item; items you deleted since come back.{" "}
            <b>Replace</b> erases this device's data first.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => restore("merge")}>
              Merge
            </button>
            <button disabled={busy} onClick={() => restore("replace")}>
              Replace
            </button>
            <button className="link" disabled={busy} onClick={() => setPending(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="hint">{message}</p>}
    </>
  );
}

const STALE_DAYS = 30;
let dismissed = false; // once per session

export function BackupBanner({ go }: { go: Go }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (dismissed) return;
    void listItems().then((items) => {
      const last = lastBackupAt();
      setShow(items.length > 0 && (!last || Date.now() - last > STALE_DAYS * 24 * 60 * 60 * 1000));
    });
  }, []);
  if (!show) return null;
  return (
    <p className="warn">
      Back up your data: it lives only in this browser.{" "}
      <button className="link" onClick={() => go({ name: "settings" })}>
        Open Settings
      </button>{" "}
      ·{" "}
      <button
        className="link"
        onClick={() => {
          dismissed = true;
          setShow(false);
        }}
      >
        Later
      </button>
    </p>
  );
}
