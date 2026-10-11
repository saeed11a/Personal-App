import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";
import { enqueue, isOfflineError } from "@/lib/syncQueue";

// The app's data layer for every business entity.
//
// The screens were written against the Base44 SDK's entity API (`filter`, `create`,
// `update`, `delete`, `bulkCreate`, `aggregate`). That backend is not linked in the
// Supabase environment, so each of those calls ended in a 404 — "Request failed with
// status code 404" on every "add new" form and every list.
//
// This module keeps the same call shapes and moves them onto Supabase's tables
// (identical table and column names, created by 0001_core_schema and protected by the
// same module-permission RLS policies). `VITE_AUTH_BACKEND` decides which backend is
// used: the shipped APK/EXE builds ('base44') keep calling Base44 exactly as before,
// while a Supabase build ('supabase') reads and writes Supabase.

const TABLES = {
  Article: "articles",
  RawStock: "raw_stocks",
  RawCategory: "raw_categories",
  ReadyShoe: "ready_shoes",
  ProductionEntry: "production_entries",
  Purchase: "purchases",
  Customer: "customers",
  Supplier: "suppliers",
  Invoice: "invoices",
  InvoiceLine: "invoice_lines",
  Payment: "payments",
  Roznamcha: "roznamcha",
  Labour: "labours",
  LabourProduction: "labour_production",
  Settings: "settings",
};

// PostgREST answers at most 1000 rows per request; aggregates page through.
const PAGE = 1000;
const DEFAULT_LIMIT = 1000;

// Base44 query operators → PostgREST filter methods.
const RANGE_OPS = { $gt: "gt", $gte: "gte", $lt: "lt", $lte: "lte" };

const fail = (error) => {
  throw new Error(error?.message || "The request could not be completed");
};

const configured = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

// Query operators keep their Base44 spelling, so the screens do not change.
const unanchor = (pattern) => String(pattern ?? "").replace(/^\^/, "").replace(/\$$/, "");

function applyQuery(builder, query) {
  let next = builder;
  Object.entries(query || {}).forEach(([field, condition]) => {
    if (field === "$or") return;
    if (condition === null) {
      next = next.is(field, null);
      return;
    }
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if ("$ne" in condition) {
        next = condition.$ne === null ? next.not(field, "is", null) : next.neq(field, condition.$ne);
      }
      Object.entries(RANGE_OPS).forEach(([operator, method]) => {
        if (operator in condition) next = next[method](field, condition[operator]);
      });
      if ("$in" in condition) next = next.in(field, condition.$in);
      if ("$regex" in condition || "$options" in condition) {
        next = next.ilike(field, `%${unanchor(condition.$regex)}%`);
      }
      return;
    }
    next = Array.isArray(condition) ? next.in(field, condition) : next.eq(field, condition);
  });

  // `$or` sits beside the plain fields: a text search across several columns.
  const or = query?.$or;
  if (Array.isArray(or)) {
    const clauses = or
      .flatMap((clause) =>
        Object.entries(clause || {}).map(([field, condition]) => {
          const value = condition && typeof condition === "object" ? condition.$regex : condition;
          return `${field}.ilike.%${unanchor(value)}%`;
        })
      )
      .filter(Boolean);
    if (clauses.length) next = next.or(clauses.join(","));
  }
  return next;
}

function applySort(builder, sort) {
  let next = builder;
  String(sort || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const descending = token.startsWith("-");
      next = next.order(descending ? token.slice(1) : token, { ascending: !descending });
    });
  return next;
}

async function fetchAll(table, query, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const builder = applyQuery(supabase.from(table).select(columns).range(from, from + PAGE - 1), query);
    const { data, error } = await builder;
    if (error) fail(error);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// day / week (Monday) / month buckets, as dates the analytics screens render.
function bucketKey(value, unit) {
  if (!value) return "";
  const iso = String(value).slice(0, 10);
  if (unit === "month") return `${iso.slice(0, 7)}-01`;
  if (unit === "week") {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  return iso;
}

function makeEntity(entity) {
  const table = TABLES[entity];
  const base44Entity = () => base44.entities[entity];

  return {
    /** { items } — the same shape the Base44 SDK returns. */
    async filter(query = {}, options = {}) {
      if (!usesSupabaseAuth) return base44Entity().filter(query, options);
      const limit = options.limit ?? DEFAULT_LIMIT;
      const offset = options.offset || 0;
      let builder = applySort(configured().from(table).select("*"), options.sort);
      builder = applyQuery(builder, query);
      builder = builder.range(offset, offset + limit - 1);
      const { data, error } = await builder;
      if (error) fail(error);
      return { items: data || [] };
    },

    async create(values = {}) {
      if (!usesSupabaseAuth) return base44Entity().create(values);
      // The row's id is minted once, here, before the first attempt. A create that
      // had to be queued offline is replayed with that same primary key, so the
      // database refuses a second copy (23505) instead of duplicating the record.
      const withId = values.id ? values : { ...values, id: crypto.randomUUID() };
      try {
        const { data, error } = await configured().from(table).insert(withId).select().single();
        if (error) {
          if (isOfflineError(error)) {
            enqueue({ op: "create", table, payload: withId, recordId: withId.id, label: `Create ${entity}` });
            return { ...withId, __pending: true };
          }
          fail(error);
        }
        return data;
      } catch (error) {
        if (isOfflineError(error)) {
          enqueue({ op: "create", table, payload: withId, recordId: withId.id, label: `Create ${entity}` });
          return { ...withId, __pending: true };
        }
        throw error;
      }
    },

    async bulkCreate(values = []) {
      if (!usesSupabaseAuth) return base44Entity().bulkCreate(values);
      if (!values.length) return [];
      const { data, error } = await configured().from(table).insert(values).select();
      if (error) fail(error);
      return data || [];
    },

    async update(id, values = {}) {
      if (!usesSupabaseAuth) return base44Entity().update(id, values);
      try {
        const { data, error } = await configured().from(table).update(values).eq("id", id).select().single();
        if (error) {
          if (isOfflineError(error)) {
            enqueue({ op: "update", table, payload: values, recordId: id, label: `Update ${entity}` });
            return { id, ...values, __pending: true };
          }
          fail(error);
        }
        return data;
      } catch (error) {
        if (isOfflineError(error)) {
          enqueue({ op: "update", table, payload: values, recordId: id, label: `Update ${entity}` });
          return { id, ...values, __pending: true };
        }
        throw error;
      }
    },

    async delete(id) {
      if (!usesSupabaseAuth) return base44Entity().delete(id);
      try {
        const { error } = await configured().from(table).delete().eq("id", id);
        if (error) {
          if (isOfflineError(error)) {
            enqueue({ op: "delete", table, recordId: id, label: `Delete ${entity}` });
            return;
          }
          fail(error);
        }
      } catch (error) {
        if (isOfflineError(error)) {
          enqueue({ op: "delete", table, recordId: id, label: `Delete ${entity}` });
          return;
        }
        throw error;
      }
    },

    /**
     * Grouped totals — the shape the analytics screens read: one row per group with
     * `count` and `sum_<field>` keys, optionally bucketed by day/week/month.
     */
    async aggregate({ query = {}, groupBy, sum = [], dateBucket } = {}) {
      if (!usesSupabaseAuth) return base44Entity().aggregate({ query, groupBy, sum, dateBucket });

      const fields = new Set(sum);
      if (groupBy) fields.add(groupBy);
      if (dateBucket?.field) fields.add(dateBucket.field);
      const rows = await fetchAll(table, query, fields.size ? Array.from(fields).join(",") : "*");

      const groups = new Map();
      rows.forEach((row) => {
        const key = dateBucket ? bucketKey(row[dateBucket.field], dateBucket.unit) : groupBy ? row[groupBy] : "";
        const mapKey = key === null || key === undefined ? "" : String(key);
        if (!groups.has(mapKey)) {
          const seed = { count: 0 };
          if (groupBy) seed[groupBy] = key;
          if (dateBucket) {
            seed.bucket = key;
            seed[dateBucket.field] = key;
          }
          sum.forEach((field) => {
            seed[`sum_${field}`] = 0;
          });
          groups.set(mapKey, seed);
        }
        const entry = groups.get(mapKey);
        entry.count += 1;
        sum.forEach((field) => {
          entry[`sum_${field}`] += Number(row[field]) || 0;
        });
      });

      return { rows: Array.from(groups.values()) };
    },
  };
}

export const db = Object.fromEntries(Object.keys(TABLES).map((entity) => [entity, makeEntity(entity)]));
