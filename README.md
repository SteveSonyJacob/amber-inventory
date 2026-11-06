# Amber — Inventory & Orders

Full-stack MVP: React, TypeScript, Vinext, Cloudflare D1. Product management and customer ordering share one UI. Owner/Customer permissions are deferred.

## Local setup (Node 22.13+)

```powershell
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sleepy_mordo.sql
npm run dev -- --port 5173 --hostname 127.0.0.1
```

Apply initial SQL once per fresh local database. Hosted migrations are applied by Sites during publication. Local and hosted data are separate.

## Verification

With the local server running:

```powershell
npx tsc --noEmit
node scripts/test-orders.mjs
```

Tests cover validation, totals, stock deduction, insufficient stock, multi-item failure, database rollback after partial work, competing checkouts, concurrent duplicate requests, and persisted item/price snapshots. Test records remain in the local demo. Do not point TEST_BASE_URL at production.

## Demo

1. Add Everyday notebook with quantity 5 and price 149.50.
2. Add two units to cart and place an order.
3. Confirm the ₹299.00 order and remaining stock of 3.
4. Open Orders, expand the order, and refresh to confirm persistence.
5. Add a zero-stock product and verify Add is disabled.

## Implementation

- `app/page.tsx`: shared inventory, cart, order history, product dialog and confirmation.
- `app/api/products/route.ts`: product read and creation. Future Owner permission belongs on POST.
- `app/api/orders/route.ts`: history and checkout. Future Customer identity belongs on POST; order history needs visibility filtering.
- `db/schema.ts` and `drizzle/`: schema and stock trigger.
- `.openai/hosting.json`: private Site identity and D1 binding.

Product and order records persist in D1. The cart and checkout reference use browser storage when available. All visitors share inventory and order history. There is no login, payment, tax, shipping, cancellation, or refund flow.

Checkout rechecks stock and calculates totals from stored prices. D1 batch transactions and a BEFORE INSERT stock trigger make order creation and deduction atomic. The trigger aborts on unavailable stock, rolling back every line and the order. Checkout IDs are unique and tied to a cart fingerprint, making retries idempotent. Prices are stored as integer paise and formatted as INR. Product names, stock limits and price limits are validated server-side.

Future roles must be enforced on the server and reflected in the UI; hiding buttons alone is insufficient. No background polling is used, so checkout revalidates stock even if a page is stale.
