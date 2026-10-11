import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, cleanUpper, num, today, findByCode, uppersStock } from "../../shared/stockOps.ts";

// Records a production run: issues uppers bags for an article, deducts those pairs
// from uppers stock and adds the produced pairs to Ready Shoes as a new batch.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const articleCode = cleanUpper(body.article_code);
    const article = await findByCode(base44, "Article", "code", articleCode);
    if (!article) return Response.json({ error: `No article found for ${articleCode || "the selected article"}` }, { status: 400 });

    const bags = num(body.input_bags);
    const pairsPerBag = num(body.pairs_per_bag);
    const cartons = num(body.output_cartons);
    const pairsPerCarton = num(body.pairs_per_carton);
    const uppersUsed = pairsPerBag > 0 ? bags * pairsPerBag : num(body.uppers_used_pairs);
    const outputPairs = pairsPerCarton > 0 ? cartons * pairsPerCarton : num(body.output_pairs);

    if (!uppersUsed && !outputPairs) {
      return Response.json({ error: "Enter the uppers issued and the ready cartons produced" }, { status: 400 });
    }

    const stock = await uppersStock(base44, article.code);
    if (uppersUsed > stock.available) {
      return Response.json(
        { error: `Only ${stock.available} pair(s) of uppers in stock for ${article.code}, ${uppersUsed} requested` },
        { status: 400 }
      );
    }

    const entry = await base44.entities.ProductionEntry.create({
      article_id: article.id,
      article_code: article.code,
      article_name: clean(article.name),
      production_date: clean(body.production_date) || today(),
      line: clean(body.line),
      shift: clean(body.shift),
      operator: clean(body.operator),
      input_bags: bags,
      pairs_per_bag: pairsPerBag,
      uppers_used_pairs: uppersUsed,
      carton_type: clean(body.carton_type),
      pairs_per_carton: pairsPerCarton,
      output_cartons: cartons,
      output_pairs: outputPairs,
      notes: clean(body.notes),
      is_deleted: false,
    });

    let batch = null;
    if (outputPairs > 0) {
      batch = await base44.entities.ReadyShoe.create({
        article_id: article.id,
        article_code: article.code,
        article_name: clean(article.name),
        batch_label: `Production ${clean(body.production_date) || today()}`,
        carton_type: clean(body.carton_type),
        pairs_per_carton: pairsPerCarton,
        cartons,
        pairs: outputPairs,
        source: "production",
        entry_date: clean(body.production_date) || today(),
        notes: clean(body.notes),
        is_deleted: false,
      });
    }

    return Response.json({
      entry,
      batch,
      uppers_available: stock.available - uppersUsed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
