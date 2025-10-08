import fetch from "node-fetch";

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const api = await fetch(`https://prod-api.lzt.market/${id}`, {
      headers: { Authorization: `Bearer ${process.env.LZT_TOKEN}` },
    });

    const json = await api.json();
    const translated = {
      ...json,
      title: await translateToEnglish(json.title),
      description: await translateToEnglish(json.description || ""),
    };
    res.status(200).json(translated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
