// Shared HIKER ERP engine.
// Every quantity in the app is either entered once with its own conversion factor
// (bags x pairs-per-bag, cartons x pairs-per-carton) or derived from the records that
// created it, so stock, kata balances and the cash book can never drift apart.

export const clean = (value: any): string => (value === undefined || value === null ? "" : String(value).trim());

export const cleanUpper = (value: any): string => clean(value).toUpperCase();

export const escapeRegex = (value: any): string => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const num = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const today = (): string => new Date().toISOString().slice(0, 10);

export const ALIVE = { is_deleted: { $ne: true } };

const exact = (value: any) => ({ $regex: "^" + escapeRegex(clean(value)) + "$", $options: "i" });

/** Reads every matching record, following the cursor (used for totals inside functions). */
export async function listAll(base44: any, entity: string, query: any): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await base44.entities[entity].filter({ ...query }, { limit: 500, cursor });
    const batch = result?.items || [];
    out.push(...batch);
    if (!result?.has_more || !result?.next_cursor) break;
    cursor = result.next_cursor;
  }
  return out;
}

export async function sumField(base44: any, entity: string, query: any, field: string): Promise<number> {
  const rows = await listAll(base44, entity, query);
  return rows.reduce((total: number, row: any) => total + num(row[field]), 0);
}

export async function findByCode(base44: any, entity: string, field: string, value: any) {
  if (!clean(value)) return null;
  const result = await base44.entities[entity].filter({ [field]: exact(value), ...ALIVE }, { limit: 1 });
  return result?.items?.[0] || null;
}

/** Articles are populated automatically from Uppers stock - never duplicated. */
export async function findOrCreateArticle(base44: any, input: any) {
  const payload = input || {};
  const code = cleanUpper(payload.code);
  const name = clean(payload.name);
  let article: any = payload.id ? (await base44.entities.Article.filter({ id: payload.id }, { limit: 1 }))?.items?.[0] : null;
  if (!article) article = await findByCode(base44, "Article", "code", code);
  if (!article) article = await findByCode(base44, "Article", "name", name);

  if (!article) {
    return await base44.entities.Article.create({
      code: code || "ART-" + Date.now().toString().slice(-6),
      name: name || code || "New Article",
      category: clean(payload.category) || "Unisex",
      status: "active",
    });
  }

  const patch: any = {};
  if (name && clean(article.name).toLowerCase() !== name.toLowerCase() && /^(art-|new article)/i.test(clean(article.name))) {
    patch.name = name;
  }
  if (payload.category && clean(payload.category) && payload.category !== article.category && !article.user_edited) {
    patch.category = clean(payload.category);
  }
  if (Object.keys(patch).length) {
    return await base44.entities.Article.update(article.id, patch);
  }
  return article;
}

/** Pairs of uppers bought for an article minus the pairs already issued to production. */
export async function uppersStock(base44: any, articleCode: any) {
  const added = await sumField(base44, "RawStock", { category: "uppers", article_code: cleanUpper(articleCode), ...ALIVE }, "total_pairs");
  const used = await sumField(base44, "ProductionEntry", { article_code: cleanUpper(articleCode), ...ALIVE }, "uppers_used_pairs");
  return { added, used, available: added - used };
}

/** Ready pairs produced (or added by hand) minus the pairs already invoiced. */
export async function readyStock(base44: any, articleCode: any) {
  const added = await sumField(base44, "ReadyShoe", { article_code: cleanUpper(articleCode), ...ALIVE }, "pairs");
  const sold = await sumField(base44, "InvoiceLine", { article_code: cleanUpper(articleCode), ...ALIVE }, "pairs");
  return { added, sold, available: added - sold };
}

/** Increases the matching raw stock line, or opens a new one when nothing matches. */
export async function addRawStock(base44: any, params: any) {
  const category = clean(params.category) || "uppers";
  const itemName = clean(params.item_name);
  const articleCode = cleanUpper(params.article_code);
  const packType = clean(params.pack_type);
  const pairsPerPack = num(params.pairs_per_pack);
  const quantity = num(params.quantity);
  const totalPairs = pairsPerPack > 0 ? quantity * pairsPerPack : num(params.total_pairs);

  let article = null;
  if (category === "uppers" && articleCode) {
    article = await findOrCreateArticle(base44, { code: articleCode, name: clean(params.article_name) || itemName, category: clean(params.article_category) });
  }

  const existing = await base44.entities.RawStock.filter(
    { category, item_name: exact(itemName), article_code: articleCode, pack_type: packType, ...ALIVE },
    { limit: 1 }
  );
  const line = existing?.items?.[0] || null;

  if (line) {
    await base44.entities.RawStock.updateMany(
      { id: line.id },
      {
        $inc: { quantity, total_pairs: totalPairs, amount: num(params.amount) },
        $set: {
          price: num(params.price) || num(line.price),
          unit: clean(params.unit) || line.unit,
          supplier_name: clean(params.supplier_name) || line.supplier_name,
          purchase_date: clean(params.purchase_date) || today(),
        },
      }
    );
    const refreshed = await base44.entities.RawStock.filter({ id: line.id }, { limit: 1 });
    return { record: refreshed?.items?.[0] || line, article };
  }

  const record = await base44.entities.RawStock.create({
    category,
    item_name: itemName,
    article_code: articleCode,
    article_id: article?.id || "",
    pack_type: packType,
    pairs_per_pack: pairsPerPack,
    quantity,
    unit: clean(params.unit),
    total_pairs: totalPairs,
    price: num(params.price),
    amount: num(params.amount) || num(params.price) * quantity,
    supplier_name: clean(params.supplier_name),
    purchase_date: clean(params.purchase_date) || today(),
    notes: clean(params.notes),
    is_deleted: false,
  });
  return { record, article };
}

export function statusFor(total: number, received: number): string {
  if (received <= 0) return "unpaid";
  if (received >= total) return "paid";
  return "partial";
}
