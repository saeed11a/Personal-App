import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, cleanUpper, num, today, findOrCreateArticle } from "../../shared/stockOps.ts";

// Creates or updates one raw stock line (Uppers, Chemicals or a custom category)
// and keeps the article list populated from Uppers stock.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const category = clean(body.category) || "uppers";
    const itemName = clean(body.item_name);
    if (!itemName) return Response.json({ error: "Item name is required" }, { status: 400 });

    const pairsPerPack = num(body.pairs_per_pack);
    const quantity = num(body.quantity);
    const unitPrice = num(body.price);
    const articleCode = cleanUpper(body.article_code);

    let article = null;
    if (category === "uppers" && articleCode) {
      article = await findOrCreateArticle(base44, {
        code: articleCode,
        name: clean(body.article_name) || itemName,
        category: clean(body.article_category),
      });
    }

    const payload = {
      category,
      item_name: itemName,
      article_code: article ? article.code : articleCode,
      article_id: article ? article.id : "",
      pack_type: clean(body.pack_type),
      pairs_per_pack: pairsPerPack,
      quantity,
      unit: clean(body.unit),
      total_pairs: pairsPerPack > 0 ? quantity * pairsPerPack : num(body.total_pairs),
      price: unitPrice,
      amount: unitPrice * quantity,
      supplier_name: clean(body.supplier_name),
      purchase_date: clean(body.purchase_date) || today(),
      custom_json: clean(body.custom_json),
      notes: clean(body.notes),
      is_deleted: false,
    };

    const record = body.id
      ? await base44.entities.RawStock.update(body.id, payload)
      : await base44.entities.RawStock.create(payload);

    return Response.json({ record, article });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
