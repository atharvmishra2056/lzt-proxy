// /api/marketplace.js

// === LZT MARKETPLACE API PROXY v2 ===
// Supports advanced filtering, sorting, searching, and pagination.

const LZT_BASE = "https://api.lzt.market";
const CATEGORIES = {
    valorant: "/valorant",
    lol: "/lol",
    steam: "/steam",
    coc: "/supercell",
    minecraft: "/minecraft",
    warface: "/warface",
    ea: "/ea",
    epic: "/epicgames",
    battlenet: "/battlenet",
};

// In-memory cache
const cache = new Map();
const CACHE_TTL = 120 * 1000; // 2 minutes

// --- Main Handler ---
export default async function handler(req, res) {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();

    const {
        category = "steam",
        page = 1,
        perPage = 21, // Multiple of 3 for grid layout
        title, // Search term
        pmin, // Min price
        pmax, // Max price
        order_by, // Sort order
    } = req.query;

    const endpoint = CATEGORIES[category.toLowerCase()];
    if (!endpoint) {
        return res.status(400).json({ error: "Invalid category" });
    }

    // --- Dynamic Cache Key based on ALL query params ---
    const cacheKey = JSON.stringify(req.query);
    const now = Date.now();

    if (cache.has(cacheKey) && now - cache.get(cacheKey).time < CACHE_TTL) {
        return res.status(200).json(cache.get(cacheKey).data);
    }

    try {
        const url = new URL(`${LZT_BASE}${endpoint}`);
        url.searchParams.set("page", page);
        url.searchParams.set("per_page", perPage);

        // --- Append optional filter/sort parameters ---
        if (title) url.searchParams.set("title", title);
        if (pmin) url.searchParams.set("pmin", pmin);
        if (pmax) url.searchParams.set("pmax", pmax);
        if (order_by) url.searchParams.set("order_by", order_by);

        const apiResp = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.LZT_TOKEN}` },
        });

        if (!apiResp.ok) {
            console.error(`LZT API Error: ${apiResp.status}`);
            return res.status(apiResp.status).json({ error: `Failed to fetch from LZT API: ${apiResp.statusText}` });
        }
        
        const json = await apiResp.json();
        const items = Array.isArray(json.items) ? json.items : [];

        // --- Translate titles in parallel for performance ---
        const translatedItems = await Promise.all(
            items.map(async (item) => ({
                ...item,
                title: await translateToEnglish(item.title),
            }))
        );

        // --- Construct final response with pagination data ---
        const data = {
            items: translatedItems,
            links: json.links, // Forwarding pagination links
            meta: json.meta,   // Forwarding pagination metadata
        };
        
        cache.set(cacheKey, { time: now, data });
        return res.status(200).json(data);

    } catch (e) {
        console.error("Handler error:", e);
        return res.status(500).json({ error: e.message || "Internal Server Error" });
    }
}

// --- Translation Helper (unchanged) ---
async function translateToEnglish(text) {
    if (!text) return "";
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ru|en`);
        const data = await res.json();
        return data?.responseData?.translatedText || text;
    } catch {
        return text; // fallback to original
    }
}
