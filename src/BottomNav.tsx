// The tab bar shown on the top-level screens. Flows (capture, review, studio, handoff, item, replies,
// model) hide it and keep their own back buttons.
import type { Go, Screen } from "./App";
import { useProEnabled } from "./proFlag";
import "./nav.css";

type Tab = "home" | "sales" | "stats" | "pro" | "settings";
export const TOP_LEVEL: Screen["name"][] = ["home", "sales", "stats", "pro", "settings"];

const ICONS: Record<Tab, React.ReactNode> = {
  home: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  sales: (
    <>
      <path d="M3 12V3h9l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  stats: <path d="M5 21V10M12 21V3M19 21v-7" />,
  pro: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
};

const LABELS: Record<Tab, string> = { home: "Items", sales: "Sales", stats: "Stats", pro: "Pro", settings: "Settings" };

export function BottomNav({ screen, go }: { screen: Screen; go: Go }) {
  const pro = useProEnabled();
  const tabs: Tab[] = pro ? ["home", "sales", "stats", "pro", "settings"] : ["home", "sales", "stats", "settings"];
  return (
    <nav className="bottom-nav" aria-label="Main">
      <div>
        {tabs.map((tab) => (
          <button key={tab} aria-current={screen.name === tab ? "page" : undefined} onClick={() => go({ name: tab })}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[tab]}
            </svg>
            {LABELS[tab]}
          </button>
        ))}
      </div>
    </nav>
  );
}
