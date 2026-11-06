import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Exercise the actual migration, including a failure after an earlier item
// has already deducted stock. No production database is touched.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL('../drizzle/0000_sleepy_mordo.sql', import.meta.url), 'utf8'));
db.exec("INSERT INTO products VALUES ('a','Notebook',5,12500,'now'),('b','Pen',0,5000,'now')");
db.exec('BEGIN');
try {
  db.exec("INSERT INTO orders VALUES ('failed','cart',30000,'now')");
  db.exec("INSERT INTO order_items VALUES ('i1','failed','a','Notebook',2,12500)");
  db.exec("INSERT INTO order_items VALUES ('i2','failed','b','Pen',1,5000)");
  assert.fail('Out-of-stock insert should abort');
} catch (e) { assert.match(e.message, /insufficient_stock/); db.exec('ROLLBACK'); }
assert.equal(db.prepare("SELECT quantity FROM products WHERE id='a'").get().quantity, 5);
assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n, 0);
assert.equal(db.prepare('SELECT count(*) AS n FROM order_items').get().n, 0);
console.log('PASS database trigger rolls back a partially processed multi-item order');
db.close();

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const call = async (path, body) => {
  const response = await fetch(`${base}/api/${path}`, body === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  return { status:response.status, data:await response.json() };
};
const create = async (name, quantity, price) => {
  const r = await call('products', { name:`Test ${name}`,quantity,price });
  assert.equal(r.status,201); return r.data;
};
const stock = async id => (await call('products')).data.find(p=>p.id===id).quantity;
const checkout = (id, product, quantity) => call('orders',{id,items:[{productId:product.id,quantity}]});
const a = await create('Notebook',5,12550);
assert.equal((await call('products',{name:'',quantity:-1,price:0})).status,400);
assert.equal((await call('products',null)).status,400);
assert.equal((await call('orders',null)).status,400);
const id = crypto.randomUUID();
const placed = await checkout(id,a,2);
assert.equal(placed.status,201); assert.equal(placed.data.total,25100); assert.equal(await stock(a.id),3);
const replay = await checkout(id,a,2);
assert.equal(replay.status,200); assert.equal(await stock(a.id),3);
assert.equal((await checkout(id,a,1)).status,409);
assert.equal((await checkout(crypto.randomUUID(),a,4)).status,409); assert.equal(await stock(a.id),3);
console.log('PASS success, totals, validation, idempotency and overselling rejection');
const unavailable = await create('Unavailable',0,2500);
const badId = crypto.randomUUID();
assert.equal((await call('orders',{id:badId,items:[{productId:a.id,quantity:1},{productId:unavailable.id,quantity:1}]})).status,409);
assert.equal(await stock(a.id),3);
assert.ok(!(await call('orders')).data.some(o=>o.id===badId));
const last = await create('Last unit',1,9900);
const race = await Promise.all([checkout(crypto.randomUUID(),last,1),checkout(crypto.randomUUID(),last,1)]);
assert.deepEqual(race.map(r=>r.status).sort(),[201,409]); assert.equal(await stock(last.id),0);
console.log('PASS multi-item failure and concurrent checkouts for the last unit');
const repeat = await create('Double click',5,100);
const repeatId=crypto.randomUUID();
const double=await Promise.all([checkout(repeatId,repeat,2),checkout(repeatId,repeat,2)]);
assert.ok(double.every(r=>r.status===200||r.status===201)); assert.equal(await stock(repeat.id),3);
assert.equal((await call('orders')).data.filter(o=>o.id===repeatId).length,1);
const saved=(await call('orders')).data.find(o=>o.id===id);
assert.equal(saved.items[0].name,a.name); assert.equal(saved.items[0].price,12550);
console.log('PASS concurrent duplicate submission and persisted item snapshots');
console.log('All inventory/order checks passed. Test records remain in the local preview only.');
