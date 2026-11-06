import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export async function GET() {
  const data = await env.DB!.prepare("SELECT * FROM products ORDER BY created_at DESC, id").all();
  return Response.json(data.results, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const { name, quantity, price } = input ?? {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
      typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000 ||
      typeof price !== "number" || !Number.isSafeInteger(price) || price < 0 || price > 100000000) {
    return Response.json({ error: "Enter a name (1–120 characters), whole stock quantity (0–1,000,000), and price up to ₹1,000,000." }, { status: 400 });
  }
  const product = { id: crypto.randomUUID(), name: name.trim(), quantity, price, created_at: new Date().toISOString() };
  await env.DB!.prepare("INSERT INTO products (id,name,quantity,price,created_at) VALUES (?,?,?,?,?)")
    .bind(product.id, product.name, quantity, price, product.created_at).run();
  return Response.json(product, { status: 201 });
}
