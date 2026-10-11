import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, cleanUpper, num, today, addRawStock } from "../../shared/stockOps.ts";

// Records a raw material purchase: increases the matching raw stock line and
// credits the supplier's kata with the purchase amount.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const itemName = clean(body.item_name);
    if (!itemName) return Response.json({ error: "Item name is required" }, { status: 400 });

    const quantity = num(body.quantity);
    const unitPrice = num(body.unit_price);
    const pairsPerPack = num(body.pairs_per_pack);
    const amount = quantity * unitPrice;
    const purchaseDate = clean(body.purchase_date) || today();

    const purchase = await base44.entities.Purchase.create({
      supplier_id: clean(body.supplier_id),
      supplier_name: clean(body.supplier_name),
      item_name: itemName,
      article_code: cleanUpper(body.article_code),
      category: clean(body.category) || "uppers",
      unit: clean(body.unit),
      pack_type: clean(body.pack_type),
      pairs_per_pack: pairsPerPack,
      quantity,
      total_pairs: pairsPerPack > 0 ? quantity * pairsPerPack : 0,
      unit_price: unitPrice,
      amount,
      purchase_date: purchaseDate,
      notes: clean(body.notes),
      is_deleted: false,
    });

    const { record, article } = await addRawStock(base44, {
      category: clean(body.category) || "uppers",
      item_name: itemName,
      article_code: cleanUpper(body.article_code),
      article_name: clean(body.article_name),
      article_category: clean(body.article_category),
      pack_type: clean(body.pack_type),
      pairs_per_pack: pairsPerPack,
      quantity,
      unit: clean(body.unit),
      price: unitPrice,
      amount,
      supplier_name: clean(body.supplier_name),
      purchase_date: purchaseDate,
      notes: clean(body.notes),
    });

    return Response.json({ purchase, raw_stock: record, article });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
