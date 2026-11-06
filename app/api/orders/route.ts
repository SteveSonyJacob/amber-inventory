import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
type Item = { productId: string; quantity: number };
type Product = { id: string; name: string; quantity: number; price: number };
export async function GET() {
  const db = env.DB!;
  const [orders, items] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id,total,created_at FROM orders ORDER BY created_at DESC"),
    db.prepare("SELECT * FROM order_items ORDER BY rowid"),
  ]);
  return Response.json(orders.results.map(o => ({ ...o, items: items.results.filter(i => i.order_id === o.id) })),
    { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const { id, items } = body ?? {};
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || !Array.isArray(items) || !items.length || items.length > 100 ||
      items.some((i: Item) => !i || typeof i.productId !== "string" || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000000) ||
      new Set(items.map((i: Item) => i.productId)).size !== items.length) return fail("Provide a valid cart with 1–100 distinct products.");
  const cart: Item[] = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  const fingerprint = JSON.stringify(cart.map(i => [i.productId, i.quantity]));
  const db = env.DB!;
  const existing = async () => db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
  const replay = (o: Record<string, unknown>) => o.fingerprint === fingerprint
    ? Response.json({ id: o.id, total: o.total, created_at: o.created_at })
    : fail("This checkout reference belongs to a different cart. Refresh and try again.", 409);
  const prior = await existing(); if (prior) return replay(prior);
  const rows = await db.prepare(`SELECT * FROM products WHERE id IN (${cart.map(() => "?").join(",")})`).bind(...cart.map(i => i.productId)).all<Product>();
  const products = new Map(rows.results.map(p => [p.id, p]));
  let total = 0;
  for (const item of cart) {
    const p = products.get(item.productId);
    if (!p) return fail("An item is no longer available.", 409);
    if (p.quantity < item.quantity) return fail(`Only ${p.quantity} units of ${p.name} are available. Update your cart.`, 409);
    total += p.price * item.quantity;
  }
  if (!Number.isSafeInteger(total)) return fail("Order total is too large.");
  const created_at = new Date().toISOString();
  try {
    // The database trigger validates AND decrements each item. D1 batch rolls the
    // entire order back if any insert fails, including a competing stock claim.
    await db.batch([
      db.prepare("INSERT INTO orders (id,fingerprint,total,created_at) VALUES (?,?,?,?)").bind(id, fingerprint, total, created_at),
      ...cart.map(i => {
        const p = products.get(i.productId)!;
        return db.prepare("INSERT INTO order_items (id,order_id,product_id,name,quantity,price) VALUES (?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, p.id, p.name, i.quantity, p.price);
      }),
    ]);
    return Response.json({ id, total, created_at }, { status: 201 });
  } catch (error) {
    const saved = await existing(); if (saved) return replay(saved);
    if (String(error).includes("insufficient_stock")) return fail("Stock changed during checkout. Review available quantities and try again.", 409);
    console.error("Checkout failed", error);
    return fail("Order could not be saved. Please retry; your cart has been kept.", 500);
  }
}
