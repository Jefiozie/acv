import { readFileSync, writeFileSync, existsSync } from "fs";
import { request } from "https";

// ─── Config ──────────────────────────────────────────────────────────────────

const RENTAL_PAGE_URL =
  "https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen";
const CALENDAR_BASE_URL =
  "https://www.acv-groep.nl/ajax/RentalProducts/getCalendar";

const PRODUCT = "2";
const TOWNSHIP = "1";
const SITE = "1";
const LANGUAGE = "nl";
const LOOKAHEAD_DAYS = 14;
const CACHE_FILE = "availability_cache.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape returned by the ACV calendar API. The API may return various formats;
 *  `parseCalendarResponse` handles normalization into this shape. */
interface CalendarDay {
  date: string; // YYYY-MM-DD
  available: boolean;
}

interface Cache {
  availableDates: string[];
}

// ─── Session ─────────────────────────────────────────────────────────────────

/** Visit the rental page to obtain a valid PHPSESSID cookie. */
async function getSessionCookie(): Promise<string> {
  const res = await fetch(RENTAL_PAGE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/PHPSESSID=([^;,\s]+)/);
  return match ? match[1] : "";
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
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: RENTAL_PAGE_URL,
      Cookie: sessionId ? `PHPSESSID=${sessionId}` : "",
    },
  });

  const text = await res.text();

  if (!text.trim()) {
    console.warn(`Empty response for ${year}-${String(month).padStart(2, "0")}`);
    return [];
  }

  try {
    const data: unknown = JSON.parse(text);
    return parseCalendarResponse(data, year, month);
  } catch {
    console.error(
      `Failed to parse JSON for ${year}-${month}. Raw response (first 500 chars):\n`,
      text.slice(0, 500)
    );
    return [];
  }
}

/**
 * Normalise the API response into CalendarDay[].
 *
 * The ACV API response format is inferred. The most common pattern for PHP
 * rental calendar APIs is an object where keys are dates and values contain
 * an availability flag, or an array of day objects. Both are handled here.
 * If you need to adjust the parsing, update this function.
 */
function parseCalendarResponse(
  data: unknown,
  year: number,
  month: number
): CalendarDay[] {
  const days: CalendarDay[] = [];

  // Format 1: array of objects with `date` and `available`/`status` fields
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const date = resolveDate(obj, year, month);
        if (date) {
          days.push({ date, available: resolveAvailability(obj) });
        }
      }
    }
    return days;
  }

  // Format 2: object where keys are day numbers or full dates
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Sub-key `days` or `calendar`
    if (Array.isArray(obj.days)) return parseCalendarResponse(obj.days, year, month);
    if (Array.isArray(obj.calendar)) return parseCalendarResponse(obj.calendar, year, month);

    // Keys are day numbers (1-31)
    for (const [key, value] of Object.entries(obj)) {
      const dayNum = parseInt(key, 10);
      if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        if (value && typeof value === "object") {
          days.push({ date, available: resolveAvailability(value as Record<string, unknown>) });
        } else {
          days.push({ date, available: Boolean(value) });
        }
      }
    }
  }

  return days;
}

function resolveDate(
  obj: Record<string, unknown>,
  year: number,
  month: number
): string | null {
  // Full ISO date
  if (typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date))
    return obj.date;
  // Day number only
  const day = obj.day ?? obj.dayNumber ?? obj.number;
  if (typeof day === "number" || (typeof day === "string" && !isNaN(Number(day)))) {
    return `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  }
  return null;
}

function resolveAvailability(obj: Record<string, unknown>): boolean {
  // Common field names for availability
  for (const key of ["available", "isAvailable", "status", "free", "open"]) {
    const val = obj[key];
    if (val === true || val === 1 || val === "1" || val === "available" || val === "open")
      return true;
    if (val === false || val === 0 || val === "0" || val === "unavailable" || val === "closed")
      return false;
  }
  return false;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getUpcomingDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);
  return { start, end };
}

function formatDateNL(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
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
  return { availableDates: [] };
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

// ─── Markdown table ───────────────────────────────────────────────────────────

function buildMessage(newDates: string[], allAvailable: string[]): string {
  const lines: string[] = [];

  lines.push("🚨 <b>ACV Aanhanger — Nieuwe beschikbare datums!</b>");
  lines.push("");

  if (newDates.length > 0) {
    lines.push(`✅ <b>Nieuw beschikbaar (${newDates.length}x):</b>`);
    for (const d of newDates) lines.push(`  • ${formatDateNL(d)}`);
    lines.push("");
  }

  if (allAvailable.length > 0) {
    lines.push(`📅 <b>Alle beschikbare datums (komende ${LOOKAHEAD_DAYS} dagen):</b>`);
    lines.push("");
    lines.push("<pre>");
    lines.push("Datum            Dag");
    lines.push("───────────────────────");
    for (const d of allAvailable) {
      const date = new Date(`${d}T00:00:00`);
      const dayStr = date.toLocaleDateString("nl-NL", { weekday: "long" });
      const dateStr = date.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
      });
      lines.push(`${dateStr.padEnd(17)}${dayStr}`);
    }
    lines.push("</pre>");
  }

  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Fetching ACV trailer calendar…");

  const session = await getSessionCookie();
  console.log(`Session: ${session ? "obtained" : "none (proceeding anyway)"}`);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;
  const nextYear = thisMonth === 12 ? thisYear + 1 : thisYear;

  const [currentMonthDays, nextMonthDays] = await Promise.all([
    fetchCalendarMonth(thisYear, thisMonth, session),
    fetchCalendarMonth(nextYear, nextMonth, session),
  ]);

  const allDays = [...currentMonthDays, ...nextMonthDays];
  console.log(`Total days fetched: ${allDays.length}`);

  const { start, end } = getUpcomingDateRange();
  const available = allDays
    .filter((d) => {
      if (!d.available) return false;
      const date = new Date(`${d.date}T00:00:00`);
      return date >= start && date < end;
    })
    .map((d) => d.date)
    .sort();

  console.log(`Available slots in next ${LOOKAHEAD_DAYS} days:`, available);

  const cache = loadCache();
  const cachedSet = new Set(cache.availableDates);
  const newDates = available.filter((d) => !cachedSet.has(d));

  console.log("New slots (not in cache):", newDates);

  if (newDates.length === 0) {
    console.log("No new slots found. Skipping Telegram notification.");
  } else {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error(
        "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set. Cannot send notification."
      );
    } else {
      const message = buildMessage(newDates, available);
      await sendTelegram(message);
      console.log(`Telegram notification sent for ${newDates.length} new slot(s).`);
    }
  }

  saveCache({ availableDates: available });
  console.log("Cache updated.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
