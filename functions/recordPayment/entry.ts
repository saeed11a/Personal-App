import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { clean, num, today } from "../../shared/stockOps.ts";

// Records one payment. Received from a customer credits his kata and the cash book;
// paid to a supplier debits the supplier balance and shows as cash out.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const partyType = clean(body.party_type) === "supplier" ? "supplier" : "customer";
    const partyName = clean(body.party_name);
    const amount = num(body.amount);
    if (!partyName) return Response.json({ error: "Select a customer or supplier" }, { status: 400 });
    if (amount <= 0) return Response.json({ error: "Payment amount must be greater than zero" }, { status: 400 });

    const paymentDate = clean(body.payment_date) || today();
    const method = clean(body.method) || "Cash";

    const payment = await base44.entities.Payment.create({
      party_type: partyType,
      party_id: clean(body.party_id),
      party_name: partyName,
      direction: partyType === "supplier" ? "out" : "in",
      amount,
      payment_date: paymentDate,
      method,
      reference: clean(body.reference),
      notes: clean(body.notes),
      is_deleted: false,
    });

    const roznamcha = await base44.entities.Roznamcha.create({
      entry_date: paymentDate,
      direction: partyType === "supplier" ? "out" : "in",
      source: partyType === "supplier" ? "supplier_payment" : "customer_receipt",
      party_type: partyType,
      party_id: clean(body.party_id),
      party_name: partyName,
      description: partyType === "supplier" ? `Paid to ${partyName}` : `Received from ${partyName}`,
      amount,
      method,
      reference: clean(body.reference),
      is_deleted: false,
    });

    return Response.json({ payment, roznamcha });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
