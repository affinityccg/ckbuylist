// /api/ckbuylist.js  —  GET /api/ckbuylist?set=MH3
export default async function handler(req, res) {
  try {
    const set = String(req.query.set || "").toUpperCase();
    if (!set) return res.status(400).send("Missing ?set=CODE");

    const BASE = "https://mtgjson.com/api/v5";

    // 1) Fetch the set to get UUIDs + metadata
    const setResp = await fetch(`${BASE}/${set}.json`);
    if (!setResp.ok) return res.status(404).send(`Bad set code ${set}`);
    const setJson = await setResp.json();
    const cards = setJson?.data?.cards || [];
    if (!cards.length) return res.status(404).send(`No cards for set ${set}`);

    const uuids = new Set(cards.map(c => c.uuid));
    const meta = new Map(cards.map(c => [c.uuid, { name: c.name || "", number: c.number || "" }]));

    // 2) Fetch today's prices (full file; Vercel can parse this)
    const priceResp = await fetch(`${BASE}/AllPricesToday.json`);
    if (!priceResp.ok) return res.status(502).send("Failed to fetch prices");
    const prices = await priceResp.json();
    const data = prices?.data || {};

    // 3) Build CSV: CK buylist → latest point per finish
    const rows = [["set","number","name","uuid","finish","price","price_date"]];
    for (const id of uuids) {
      const node = data[id]?.paper?.cardkingdom?.buylist;
      if (!node) continue;
      for (const finish of Object.keys(node)) {
        const hist = node[finish];
        if (!hist) continue;
        const dates = Object.keys(hist).sort();
        if (!dates.length) continue;
        const last = dates[dates.length - 1];
        const m = meta.get(id) || { name: "", number: "" };
        rows.push([set, m.number, m.name, id, finish, hist[last], last]);
      }
    }

    const csv = rows.map(r => r.map(x => {
      const s = String(x ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).send("Error: " + (e?.message || String(e)));
  }
}
