import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, cleanUpper, num, today, findByCode, findOrCreateArticle, readyStock, statusFor } from "../../shared/stockOps.ts";

// Creates an invoice: cartons are converted into pairs, the pairs are checked against
// ready shoes stock and then deducted from it, and the customer's kata is updated.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const customerName = clean(body.customer?.name);
    if (!customerName) return Response.json({ error: "Customer name is required" }, { status: 400 });
    if (!items.length) return Response.json({ error: "Add at least one item to the invoice" }, { status: 400 });

    const lines: any[] = [];
    const requested: Record<string, number> = {};

    for (const raw of items) {
      const articleCode = cleanUpper(raw.article_code);
      if (!articleCode) return Response.json({ error: "Every line needs an article" }, { status: 400 });
      const cartons = num(raw.cartons);
      const pairsPerCarton = num(raw.pairs_per_carton);
      const pairs = pairsPerCarton > 0 ? cartons * pairsPerCarton : num(raw.pairs);
      if (pairs <= 0) return Response.json({ error: `Enter the carton quantity for ${articleCode}` }, { status: 400 });
      const article = (await findByCode(base44, "Article", "code", articleCode)) || (await findOrCreateArticle(base44, { code: articleCode }));
      const pricePerPair = num(raw.price_per_pair);
      lines.push({
        article_id: article.id,
        article_code: article.code,
        article_name: clean(article.name),
        carton_type: clean(raw.carton_type),
        pairs_per_carton: pairsPerCarton,
        cartons,
        pairs,
        price_per_pair: pricePerPair,
        line_total: pairs * pricePerPair,
      });
      requested[article.code] = (requested[article.code] || 0) + pairs;
    }

    for (const code of Object.keys(requested)) {
      const stock = await readyStock(base44, code);
      if (requested[code] > stock.available) {
        return Response.json(
          { error: `Only ${stock.available} pair(s) of ${code} in Ready Shoes stock, ${requested[code]} needed` },
          { status: 400 }
        );
      }
    }

    let customer = body.customer?.id ? null : await findByCode(base44, "Customer", "name", customerName);
    if (!customer && !body.customer?.id) {
      customer = await base44.entities.Customer.create({
        name: customerName,
        phone: clean(body.customer?.phone),
        address: clean(body.customer?.address),
        city: clean(body.customer?.city),
        opening_balance: 0,
        status: "active",
        is_deleted: false,
      });
    }
    if (body.customer?.id) {
      const found = await base44.entities.Customer.filter({ id: body.customer.id }, { limit: 1 });
      customer = found?.items?.[0] || customer;
    }

    const settings = (await base44.entities.Settings.filter({}, { limit: 1 }))?.items?.[0] || {};
    const invoiceCount = await base44.entities.Invoice.count({});
    const prefix = clean(settings.invoice_prefix) || "INV";
    let invoiceNumber = `${prefix}-${String(invoiceCount + 1).padStart(4, "0")}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const clash = await base44.entities.Invoice.filter({ invoice_number: invoiceNumber }, { limit: 1 });
      if (!clash?.items?.length) break;
      invoiceNumber = `${prefix}-${String(invoiceCount + 2 + attempt).padStart(4, "0")}`;
    }

    const subtotal = lines.reduce((total, line) => total + line.line_total, 0);
    const discount = num(body.discount);
    const total = Math.max(subtotal - discount, 0);
    const received = num(body.received);
    const invoiceDate = clean(body.invoice_date) || today();

    const invoice = await base44.entities.Invoice.create({
      invoice_number: invoiceNumber,
      customer_id: customer?.id || "",
      customer_name: customerName,
      customer_phone: clean(customer?.phone || body.customer?.phone),
      customer_address: clean(customer?.address || body.customer?.address),
      invoice_date: invoiceDate,
      invoice_time: clean(body.invoice_time) || new Date().toTimeString().slice(0, 5),
      total_cartons: lines.reduce((total, line) => total + num(line.cartons), 0),
      total_pairs: lines.reduce((total, line) => total + line.pairs, 0),
      subtotal,
      discount,
      total,
      received,
      balance: Math.max(total - received, 0),
      payment_method: clean(body.payment_method) || "Cash",
      status: statusFor(total, received),
      notes: clean(body.notes),
      is_deleted: false,
    });

    const created = await base44.entities.InvoiceLine.bulkCreate(
      lines.map((line) => ({
        ...line,
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        customer_id: customer?.id || "",
        customer_name: customerName,
        invoice_date: invoiceDate,
        is_deleted: false,
      }))
    );

    let payment = null;
    if (received > 0) {
      payment = await base44.entities.Payment.create({
        party_type: "customer",
        party_id: customer?.id || "",
        party_name: customerName,
        direction: "in",
        amount: received,
        payment_date: invoiceDate,
        method: clean(body.payment_method) || "Cash",
        reference: invoiceNumber,
        notes: `Received against ${invoiceNumber}`,
        is_deleted: false,
      });
      await base44.entities.Roznamcha.create({
        entry_date: invoiceDate,
        direction: "in",
        source: "customer_receipt",
        party_type: "customer",
        party_id: customer?.id || "",
        party_name: customerName,
        description: `Received against ${invoiceNumber}`,
        amount: received,
        method: clean(body.payment_method) || "Cash",
        reference: invoiceNumber,
        is_deleted: false,
      });
    }

    return Response.json({ invoice, lines: created, payment });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
