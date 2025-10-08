const LZT_BASE = "https://prod-api.lzt.market";
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

// Optional simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120 * 1000; // 2 minutes

export default async function handler(req, res) {
  const { category = "steam", page = 1, perPage = 20, inactiveDays = 7 } = req.query;
  const endpoint = CATEGORIES[category.toLowerCase()];
  if (!endpoint) return res.status(400).json({ error: "Invalid category" });

  const cacheKey = `${category}:${page}`;
  const now = Date.now();

  // Use cache if available
  if (cache.has(cacheKey) && now - cache.get(cacheKey).time < CACHE_TTL) {
    return res.status(200).json(cache.get(cacheKey).data);
  }

  try {
    const url = new URL(`${LZT_BASE}${endpoint}`);
    url.searchParams.set("page", page);
    url.searchParams.set("per_page", perPage);

    const apiResp = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.LZT_TOKEN}` },
    });

    const json = await apiResp.json();
    const items = json.items || json || [];

    // Filter: only items inactive ≥ 7 days
    const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
    const filtered = items.filter(it => {
      const last = (it.account_last_activity || it.update_stat_date || 0) * 1000;
      return last < cutoff;
    });

    // Translate Russian → English (basic)
    const translated = await Promise.all(
      filtered.map(async item => ({
        ...item,
        title: await translateToEnglish(item.title),
        description: await translateToEnglish(item.description || ""),
      }))
    );

    const data = { category, page, count: translated.length, items: translated };
    cache.set(cacheKey, { time: now, data });
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

async function translateToEnglish(text) {
  if (!text) return "";
  try {
    const res = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=ru|en");
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch {
    return text;
  }
}
