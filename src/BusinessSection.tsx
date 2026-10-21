// "I sell as a business" in Settings: the switch that shows the Pro tab, and the details used on exports
// and receipts. Saved as you type, like the other settings.
import { useState } from "react";
import { readProfile, saveProfile, siretWarning, type Activity, type BusinessProfile, type VatRegime } from "./businessProfile";

export function BusinessSection() {
  const [p, setP] = useState(readProfile);
  const set = (patch: Partial<BusinessProfile>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveProfile(next);
  };
  const warning = siretWarning(p.siret);

  return (
    <section>
      <h2 className="or">Selling as a business</h2>
      <label className="inline">
        <input type="checkbox" checked={p.sellsAsBusiness} onChange={(e) => set({ sellsAsBusiness: e.target.checked })} />
        I sell as a business (shows the Pro tab)
      </label>
      {p.sellsAsBusiness && (
        <>
          <label>
            Name or business name
            <input value={p.legalName} onChange={(e) => set({ legalName: e.target.value })} autoComplete="off" />
          </label>
          <label>
            SIRET
            <input value={p.siret} inputMode="numeric" onChange={(e) => set({ siret: e.target.value })} autoComplete="off" />
          </label>
          {warning && <p className="warn">{warning}</p>}
          <div className="grid">
            <label>
              Status
              <select value={p.activity} onChange={(e) => set({ activity: e.target.value as Activity })}>
                <option value="micro">Micro-entrepreneur</option>
                <option value="company">Company</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              VAT
              <select value={p.vatRegime} onChange={(e) => set({ vatRegime: e.target.value as VatRegime })}>
                <option value="franchise">VAT-exempt (franchise)</option>
                <option value="subject">Subject to VAT</option>
              </select>
            </label>
          </div>
          <label>
            Address
            <textarea rows={2} value={p.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
          <label>
            Receipt footer (optional)
            <textarea rows={2} value={p.receiptFooter} placeholder="e.g. TVA non applicable, art. 293 B du CGI" onChange={(e) => set({ receiptFooter: e.target.value })} />
          </label>
          <p className="hint">Kept on this device and included in your backup. The app does not check the details with any authority.</p>
        </>
      )}
    </section>
  );
}
