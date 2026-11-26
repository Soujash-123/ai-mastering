// Campaign attribution for the early-access form.
//
// UTM parameters are read from the URL of whichever page the visitor lands on
// (usually /), kept in sessionStorage so they survive the click through to
// /access-request, and appended to the request's reason text on submit.
// sessionStorage is per tab and is cleared when the tab closes.

export type Utm = { source: string; medium: string; campaign: string };

const KEY = "kord_utm";
const FIELDS = ["source", "medium", "campaign"] as const;

/** Keeps tags short and printable so they can't bloat or garble the reason text. */
function clean(v: string | null): string {
  return (v ?? "")
    .replace(/[^\w.\-+~@ ]/g, "")
    .trim()
    .slice(0, 64);
}

/** Saves any utm_source/medium/campaign in the current URL. A new tagged visit replaces an older one. */
export function captureUtm(search: string = typeof window === "undefined" ? "" : window.location.search): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(search);
  const utm: Utm = { source: "", medium: "", campaign: "" };
  for (const f of FIELDS) utm[f] = clean(params.get(`utm_${f}`));
  if (!utm.source && !utm.medium && !utm.campaign) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(utm));
  } catch {
    /* storage disabled (private mode etc.): attribution is best-effort */
  }
}

export function readUtm(): Utm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Utm>;
    const utm: Utm = {
      source: clean(parsed.source ?? ""),
      medium: clean(parsed.medium ?? ""),
      campaign: clean(parsed.campaign ?? ""),
    };
    return utm.source || utm.medium || utm.campaign ? utm : null;
  } catch {
    return null;
  }
}

/** " [src: reddit/post/sideproject]"; empty parts show as "-". Empty string when there is no UTM data. */
export function utmTag(utm: Utm | null): string {
  if (!utm) return "";
  return ` [src: ${utm.source || "-"}/${utm.medium || "-"}/${utm.campaign || "-"}]`;
}
