// === LZT ACCOUNT DETAIL PROXY ===
// Fetches a single account by ID, translates text, adds CORS headers.

export default async function handler(req, res) {
  // --- ✅ CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const api = await fetch(`https://api.lzt.market/${id}`, {
      headers: { Authorization: `Bearer ${process.env.LZT_TOKEN}` },
    });

    const text = await api.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("Invalid JSON from LZT:", text.slice(0, 200));
      return res.status(502).json({ error: "Bad response from LZT API" });
    }

    const translated = {
      ...json,
      title: await translateToEnglish(json.title),
      description: await translateToEnglish(json.description || ""),
    };

    return res.status(200).json(translated);
  } catch (e) {
    console.error("Detail fetch error:", e);
    return res.status(500).json({ error: e.message || "Internal Server Error" });
  }
}

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
    return text; // fallback
  }
}
