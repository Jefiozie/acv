import { readFileSync, writeFileSync, existsSync } from "fs";
import { request } from "https";

// ─── Config ──────────────────────────────────────────────────────────────────

const RENTAL_PAGE_URL =
  "https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen";
const CALENDAR_BASE_URL =
  "https://www.acv-groep.nl/ajax/RentalProducts/getCalendar";
const SET_PROFILE_URL =
  "https://www.acv-groep.nl/ajax/Filters/SetProfileOption";

const PRODUCT = "2";
const TOWNSHIP = process.env.TOWNSHIP ?? "16"; // default: Ede (16)
const SITE = "1";
const LANGUAGE = "nl";
const LOOKAHEAD_DAYS = 14;
const CACHE_FILE = "availability_cache.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Types ────────────────────────────────────────────────────────────────────

type DayState = "available" | "semi" | "full" | "unavailable";

interface TimePart {
  id: string;
  text: string; // e.g. "08:00:00 - 10:00:00"
  status: "available" | "disabled";
}

interface CalendarDay {
  day: string;
  date: string;     // "YYYY-MM-DD"
  weekday: string;  // "1" = Monday .. "7" = Sunday
  state: DayState;
  parts?: TimePart[];
}

interface CalendarResponse {
  valid: boolean;
  year: number;
  month: number;
  month_name: string;
  days: CalendarDay[];
}

/** Cache: date → available time slot texts */
interface CacheEntry {
  state: DayState;
  slots: string[];
}

interface Cache {
  [date: string]: CacheEntry;
}

// ─── Session ─────────────────────────────────────────────────────────────────

/**
 * Establishes a session:
 * 1. GET rental page → obtain PHPSESSID
 * 2. POST SetProfileOption to activate the township in the session
 */
async function getSession(): Promise<string> {
  const pageRes = await fetch(RENTAL_PAGE_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  const setCookie = pageRes.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/PHPSESSID=([^;,\s]+)/);
  const sessionId = match ? match[1] : "";

  if (!sessionId) {
    console.warn("Could not obtain PHPSESSID");
    return "";
  }

  const setRes = await fetch(SET_PROFILE_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Referer: RENTAL_PAGE_URL,
      Cookie: `PHPSESSID=${sessionId}`,
    },
    body: `option=${TOWNSHIP}`,
  });

  const setBody = (await setRes.json()) as { success?: boolean };
  if (!setBody.success) {
    console.warn("SetProfileOption did not return success:", setBody);
  }

  console.log(`Session ready (PHPSESSID=${sessionId}, township=${TOWNSHIP})`);
  return sessionId;
}

// ─── Calendar fetch ───────────────────────────────────────────────────────────

async function fetchCalendarMonth(
  year: number,
  month: number,
  sessionId: string
): Promise<CalendarDay[]> {
  const url = `${CALENDAR_BASE_URL}?product=${PRODUCT}&y=${year}&m=${month}&language=${LANGUAGE}&township=${TOWNSHIP}&site=${SITE}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: RENTAL_PAGE_URL,
      Cookie: `PHPSESSID=${sessionId}`,
    },
  });

  const text = await res.text();
  const label = `${year}-${String(month).padStart(2, "0")}`;

  if (!text.trim()) {
    console.warn(`Empty response for ${label}`);
    return [];
  }

  let data: CalendarResponse;
  try {
    data = JSON.parse(text) as CalendarResponse;
  } catch {
    console.error(`Failed to parse JSON for ${label}. First 300 chars:\n`, text.slice(0, 300));
    return [];
  }

  if (!data.valid) {
    console.warn(`API returned valid=false for ${label}`);
    return [];
  }

  console.log(`Fetched ${data.days.length} days for ${label} (${data.month_name})`);
  return data.days;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUpcomingDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);
  return { start, end };
}

function formatDateNL(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "08:00:00 - 10:00:00" → "08:00 - 10:00" */
function normalizeTime(text: string): string {
  return text.replace(/:00(?= |-|$)/g, "");
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function loadCache(): Cache {
  if (existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Cache;
    } catch {
      // Corrupt cache — start fresh
    }
  }
  return {};
}

function saveCache(cache: Cache): void {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

function sendTelegram(message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });

    const req = request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (parsed.ok) {
            resolve();
          } else {
            reject(new Error(`Telegram error: ${parsed.description}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Message builder ──────────────────────────────────────────────────────────

interface SlotRow {
  date: string;
  state: DayState;
  slots: string[];
  isNew: boolean;
}

function buildMessage(rows: SlotRow[]): string {
  const newCount = rows.filter((r) => r.isNew).length;
  const lines: string[] = [];

  lines.push(`🚨 <b>ACV Aanhanger — ${newCount} nieuwe tijdslot(en) beschikbaar!</b>`);
  lines.push(`<i>Komende ${LOOKAHEAD_DAYS} dagen — volledig overzicht</i>`);
  lines.push("");
  lines.push("<pre>");
  lines.push("Datum                   Tijdsloten");
  lines.push("─".repeat(46));

  for (const row of rows) {
    const icon = row.state === "available" ? "✅" : "⚡";
    const newTag = row.isNew ? " 🆕" : "   ";
    const dateLabel = formatDateNL(row.date).padEnd(24);
    const slotLine = row.slots.length > 0 ? row.slots[0] : "—";
    lines.push(`${icon}${newTag}${dateLabel}${slotLine}`);
    for (let i = 1; i < row.slots.length; i++) {
      lines.push(`         ${"".padEnd(24)}${row.slots[i]}`);
    }
  }

  lines.push("</pre>");
  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Fetching ACV trailer calendar…");

  const sessionId = await getSession();

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;
  const nextYear = thisMonth === 12 ? thisYear + 1 : thisYear;

  const [currentMonthDays, nextMonthDays] = await Promise.all([
    fetchCalendarMonth(thisYear, thisMonth, sessionId),
    fetchCalendarMonth(nextYear, nextMonth, sessionId),
  ]);

  const { start, end } = getUpcomingDateRange();

  const upcomingAvailable = [...currentMonthDays, ...nextMonthDays].filter((d) => {
    if (d.state !== "available" && d.state !== "semi") return false;
    const date = new Date(`${d.date}T00:00:00`);
    return date >= start && date < end;
  });

  console.log(
    `Days with availability in next ${LOOKAHEAD_DAYS} days:`,
    upcomingAvailable.map((d) => `${d.date}(${d.state})`)
  );

  // Build current availability map
  const currentCache: Cache = {};
  for (const day of upcomingAvailable) {
    const availSlots = (day.parts ?? [])
      .filter((p) => p.status === "available")
      .map((p) => normalizeTime(p.text));
    currentCache[day.date] = { state: day.state, slots: availSlots };
  }

  // Find dates/slots not seen before
  const previousCache = loadCache();
  const newOrUpdated = upcomingAvailable.filter((day) => {
    const prev = previousCache[day.date];
    if (!prev) return true; // new date
    const prevSlots = new Set(prev.slots);
    return currentCache[day.date].slots.some((s) => !prevSlots.has(s));
  });

  console.log("New/updated:", newOrUpdated.map((d) => d.date));

  if (newOrUpdated.length === 0) {
    console.log("No new slots. Skipping notification.");
  } else {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.");
    } else {
      const newDates = new Set(newOrUpdated.map((d) => d.date));
      const rows: SlotRow[] = upcomingAvailable.map((day) => ({
        date: day.date,
        state: day.state,
        slots: currentCache[day.date].slots,
        isNew: newDates.has(day.date),
      }));
      await sendTelegram(buildMessage(rows));
      console.log(`Telegram sent for ${newOrUpdated.length} new/updated slot(s).`);
    }
  }

  saveCache(currentCache);
  console.log("Cache updated.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
