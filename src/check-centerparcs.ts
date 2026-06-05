import { request } from "https";
import { existsSync, readFileSync, writeFileSync } from "fs";

// Load .env locally if present
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

const URL = `https://www.centerparcs.nl/nl-nl/nederland/fp_HB_vakantiepark-het-heijderbos/cottages?market=nl&language=nl&c=CPE_PRODUCT&univers=cpe&type=PRODUCT_COTTAGES&item=HB&currency=EUR&group=housing&sort=popularity_housing&asc=asc&page=1&nb=30&displayPrice=default&dateuser=1&facet[DISPO]=-1&facet[DATE]=2026-12-28&facet[DATEEND]=2027-01-01&facet[COUNTRYSITE][]=l2_HB&facet[COUNTRYSITE][]=l1_undefined&facet[MULTIPARTICIPANTS][0][adult]=2&facet[MULTIPARTICIPANTS][0][pet]=0&facet[MULTIPARTICIPANTS][0][ages][]=2&facet[MULTIPARTICIPANTS][0][ages][]=5`;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const CACHE_FILE = "centerparcs_cache.json";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionCode {
  code: string;
  name: string;
}

interface Price {
  value: string;
}

interface CottageCache {
  price: {
    original: Price;
    promo?: Price;
    discount?: number;
  };
  stock: number;
  maxPersons: number;
  date: string;
  dateEnd: string;
}

interface Housing {
  code: string;
  comfortLevel: { name: string };
  name: string;
  housingType: { name: string };
}

interface TrackResultItem {
  actionCode?: ActionCode;
  cache: CottageCache;
  housing: Housing;
  offer: { name: string };
}

/** Persisted state per cottage code */
interface CachedCottage {
  promoPrice: string | null;
  originalPrice: string;
  firstSeen: string; // ISO timestamp
}

type StateCache = Record<string, CachedCottage>;

// ─── State cache ──────────────────────────────────────────────────────────────

function loadState(): StateCache {
  if (existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as StateCache;
    } catch {
      // Corrupt cache — start fresh
    }
  }
  return {};
}

function saveState(state: StateCache): void {
  writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPage(): Promise<string> {
  const res = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching Center Parcs page`);
  }

  return res.text();
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseTrackResultItems(html: string): TrackResultItem[] {
  const items: TrackResultItem[] = [];
  const pattern = /trackResultItems\[\d+\]\s*=\s*(\{[\s\S]*?\});/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      items.push(JSON.parse(match[1]) as TrackResultItem);
    } catch {
      console.warn("Failed to parse trackResultItem:", match[1].slice(0, 100));
    }
  }

  return items;
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

function formatEur(value: string): string {
  return `€${parseInt(value, 10).toLocaleString("nl-NL")}`;
}

interface EnrichedItem {
  item: TrackResultItem;
  isNew: boolean;
  isPriceChange: boolean;
  previousPromoPrice: string | null;
}

function buildMessage(enriched: EnrichedItem[]): string {
  const now = new Date().toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];

  if (enriched.length === 0) {
    lines.push(`❌ <b>Center Parcs Het Heijderbos — Geen beschikbaarheid</b>`);
    lines.push(`<i>28 dec 2026 – 1 jan 2027 · 2 volwassenen + 2 kinderen</i>`);
    lines.push(`<i>Gecontroleerd op ${now}</i>`);
    return lines.join("\n");
  }

  const newCount = enriched.filter((e) => e.isNew).length;
  const changedCount = enriched.filter((e) => e.isPriceChange).length;
  const statusParts: string[] = [];
  if (newCount > 0) statusParts.push(`${newCount} nieuw`);
  if (changedCount > 0) statusParts.push(`${changedCount} prijswijziging`);
  const statusSuffix = statusParts.length > 0 ? ` · ${statusParts.join(", ")}` : "";

  lines.push(
    `🏕️ <b>Center Parcs Het Heijderbos — ${enriched.length} cottage(s) beschikbaar${statusSuffix}!</b>`
  );
  lines.push(`<i>28 dec 2026 – 1 jan 2027 · 2 volwassenen + 2 kinderen</i>`);
  lines.push(`<i>Gecontroleerd op ${now}</i>`);
  lines.push("");

  for (const { item, isNew, isPriceChange, previousPromoPrice } of enriched) {
    const { housing, cache, actionCode } = item;
    const originalPrice = formatEur(cache.price.original.value);
    const promoPrice = cache.price.promo
      ? formatEur(cache.price.promo.value)
      : null;
    const discount = cache.price.discount;

    const badge = isNew ? " 🆕" : isPriceChange ? " 💰" : "";
    lines.push(
      `🏠 <b>${housing.comfortLevel.name} — ${housing.name}</b> (<code>${housing.code}</code>)${badge}`
    );

    if (promoPrice && discount) {
      lines.push(
        `   💶 <s>${originalPrice}</s> → <b>${promoPrice}</b> (${discount}% korting)`
      );
    } else {
      lines.push(`   💶 <b>${originalPrice}</b>`);
    }

    if (isPriceChange && previousPromoPrice) {
      lines.push(`   ↳ was ${previousPromoPrice}`);
    }

    if (actionCode) {
      lines.push(`   🏷️ ${actionCode.name}`);
    }

    lines.push(`   👥 Max. ${cache.maxPersons} personen · Voorraad: ${cache.stock}`);
    lines.push("");
  }

  lines.push(
    `🔗 <a href="${URL.split("?")[0]}">Bekijk op centerparcs.nl</a>`
  );

  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Fetching Center Parcs Het Heijderbos availability…");

  const html = await fetchPage();
  const items = parseTrackResultItems(html);
  const previousState = loadState();
  const now = new Date().toISOString();

  console.log(`Found ${items.length} cottage(s) available.`);

  // Enrich items with change detection and build new state
  const newState: StateCache = {};
  const enriched: EnrichedItem[] = items.map((item) => {
    const code = item.housing.code;
    const promoPrice = item.cache.price.promo?.value ?? null;
    const originalPrice = item.cache.price.original.value;
    const prev = previousState[code];

    const isNew = !prev;
    const isPriceChange = !!prev && prev.promoPrice !== promoPrice;

    newState[code] = {
      promoPrice,
      originalPrice,
      firstSeen: prev?.firstSeen ?? now,
    };

    console.log(
      `  ${code} · ${item.housing.comfortLevel.name} · ${item.housing.name} · €${originalPrice}` +
        (isNew ? " [NEW]" : isPriceChange ? ` [PRICE CHANGE: was ${prev!.promoPrice}]` : "")
    );

    return {
      item,
      isNew,
      isPriceChange,
      previousPromoPrice: prev?.promoPrice ? formatEur(prev.promoPrice) : null,
    };
  });

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification.");
  } else {
    const message = buildMessage(enriched);
    await sendTelegram(message);
    console.log("Telegram notification sent.");
  }

  saveState(newState);
  console.log("State cache updated.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
