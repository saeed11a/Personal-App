import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, cleanUpper, num, today, findOrCreateArticle } from "../../shared/stockOps.ts";

// Creates or updates a ready shoe batch: cartons x pairs-per-carton = pairs.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const articleCode = cleanUpper(body.article_code);
    if (!articleCode) return Response.json({ error: "Article number is required" }, { status: 400 });

    const pairsPerCarton = num(body.pairs_per_carton);
    const cartons = num(body.cartons);
    const article = await findOrCreateArticle(base44, {
      id: body.article_id,
      code: articleCode,
      name: clean(body.article_name),
      category: clean(body.article_category),
    });

    const payload = {
      article_id: article.id,
      article_code: article.code,
      article_name: clean(article.name),
      batch_label: clean(body.batch_label),
      carton_type: clean(body.carton_type),
      pairs_per_carton: pairsPerCarton,
      cartons,
      pairs: pairsPerCarton > 0 ? cartons * pairsPerCarton : num(body.pairs),
      source: clean(body.source) || "manual",
      entry_date: clean(body.entry_date) || today(),
      notes: clean(body.notes),
      is_deleted: false,
    };

    const record = body.id
      ? await base44.entities.ReadyShoe.update(body.id, payload)
      : await base44.entities.ReadyShoe.create(payload);

    return Response.json({ record, article });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
