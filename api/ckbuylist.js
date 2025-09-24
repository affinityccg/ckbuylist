// /api/ckbuylist.js  —  GET /api/ckbuylist?set=MH3[&format=json][&finish=normal|foil|etched]
export default async function handler(req, res) {
  try {
    const set = String(req.query.set || "").toUpperCase();
    if (!set) return res.status(400).send("Missing ?set=CODE");

    const format = String(req.query.format || "csv").toLowerCase();   // "csv" | "json"
    const finishFilter = String(req.query.finish || "").toLowerCase(); // optional

    const BASE = "https://mtgjson.com/api/v5";

    // 1) Fetch the set to get card metadata (we will also lift scryfallId for Shopify mapping)
    const setResp = await fetch(`${BASE}/${set}.json`);
    if (!setResp.ok) return res.status(404).send(`Bad set code ${set}`);
    const setJson = await setResp.json();
    const cards = setJson?.data?.cards || [];
    if (!cards.length) return res.status(404).send(`No cards for set ${set}`);

    // uuid -> {name, number, scryfallId}
    const meta = new Map(
      cards.map(c => [
        c.uuid,
        {
          name: c.name || "",
          number: c.number || "",
          scryfallId: c.identifiers?.scryfallId || ""
        }
      ])
    );

    // 2) Fetch today's full price tree
    const priceResp = await fetch(`${BASE}/AllPricesToday.json`);
    if (!priceResp.ok) return res.status(502).send("Failed to fetch prices");
    const prices = await priceResp.json();
    const data = prices?.data || {};

    // 3) Build items (shared for CSV or JSON)
    const items = [];
    for (const [uuid, m] of meta.entries()) {
      const node = data[uuid]?.paper?.cardkingdom?.buylist;
      if (!node) continue;

      for (const finish of Object.keys(node)) {
        const f = finish.toLowerCase(); // normalize
        if (finishFilter && f !== finishFilter) continue;

        const hist = node[finish];
        if (!hist) continue;

        const dates = Object.keys(hist).sort();
        if (!dates.length) continue;

        const last = dates[dates.length - 1];
        const price = hist[last];

        items.push({
          set,
          number: m.number,
          name: m.name,
          uuid,
          scryfallId: m.scryfallId,
          finish: f,             // "normal" | "foil" | "etched"
          price,                 // number
          price_date: last       // "YYYY-MM-DD"
        });
      }
    }

    // 4) Output
    if (format === "json") {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res.status(200).json({ set, count: items.length, data: items });
    }

    // CSV (default)
    const header = ["set","number","name","uuid","finish","price","price_date","scryfallId"];
    const rows = [header, ...items.map(it => [
      it.set, it.number, it.name, it.uuid, it.finish, it.price, it.price_date, it.scryfallId
    ])];

    const csv = rows.map(r =>
      r.map(x => {
        const s = String(x ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).send("Error: " + (e?.message || String(e)));
  }
}

