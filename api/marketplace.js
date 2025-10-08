// === LZT MARKETPLACE API PROXY ===
// Fetches category listings, filters inactive accounts, translates text, adds CORS + caching.

const LZT_BASE = "https://api.lzt.market"; // use working endpoint
const CATEGORIES = {
  valorant: "/valorant",
  lol: "/lol",
  steam: "/steam",
  coc: "/supercell", // Clash of Clans (Supercell)
  minecraft: "/minecraft",
  warface: "/warface",
  ea: "/ea",
  epic: "/epicgames",
  battlenet: "/battlenet",
};

// In-memory cache (lightweight, resets on cold start)
const cache = new Map();
const CACHE_TTL = 120 * 1000; // 2 minutes

export default async function handler(req, res) {
  // --- ✅ CORS headers (required for Framer / browser requests)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { category = "steam", page = 1, perPage = 20, inactiveDays = 7 } = req.query;
  const endpoint = CATEGORIES[category.toLowerCase()];
  if (!endpoint) return res.status(400).json({ error: "Invalid category" });

  const cacheKey = `${category}:${page}`;
  const now = Date.now();

  // --- ✅ Serve cached result if available
  if (cache.has(cacheKey) && now - cache.get(cacheKey).time < CACHE_TTL) {
    return res.status(200).json(cache.get(cacheKey).data);
  }

  try {
    const url = new URL(`${LZT_BASE}${endpoint}`);
    url.searchParams.set("page", page);
    url.searchParams.set("per_page", perPage);

    // --- ✅ Fetch safely from LZT
    const apiResp = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.LZT_TOKEN}` },
    });

    const text = await apiResp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("Invalid JSON from LZT:", text.slice(0, 200));
      return res.status(502).json({ error: "Bad response from LZT API" });
    }

    const items = Array.isArray(json.items) ? json.items : [];

    // --- ✅ Filter inactive accounts (≥7 days)
    const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
    const filtered = items.filter((it) => {
      const last = (it.account_last_activity || it.update_stat_date || 0) * 1000;
      return last < cutoff;
    });

    // --- ✅ Translate titles/descriptions
    const translated = await Promise.all(
      filtered.map(async (item) => ({
        ...item,
        title: await translateToEnglish(item.title),
        description: await translateToEnglish(item.description || ""),
      }))
    );

    const data = { category, page, count: translated.length, items: translated };
    cache.set(cacheKey, { time: now, data });

    return res.status(200).json(data);
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(500).json({ error: e.message || "Internal Server Error" });
  }
}

// --- Translation helper with timeout & fallback ---
async function translateToEnglish(text) {
  if (!text) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=ru|en",
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch {
    return text; // fallback to original
  }
}
