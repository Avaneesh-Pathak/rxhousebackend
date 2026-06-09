const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

/* CORS FIX */
app.use(cors({
    origin: [
        'https://rxhouse.netlify.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    console.log('Origin:', req.headers.origin);
    next();
});

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rxhouse';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT,
      price NUMERIC,
      img TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_clicks (
      id SERIAL PRIMARY KEY,
      platform TEXT,
      fullDate TEXT,
      date TEXT,
      page TEXT,
      device TEXT,
      browser TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      billing JSONB,
      itemCount INTEGER,
      subtotal NUMERIC,
      shipping NUMERIC,
      tax NUMERIC,
      total NUMERIC,
      date TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
      name TEXT,
      pillQty INTEGER,
      linePrice NUMERIC
    );
  `);
}

async function seedProductsIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (rows && rows[0] && rows[0].count === 0) {
    const sample = [
      { id:1, name:'ASPADOL 100mg', price:249, img:'images/aspadol-100.webp' },
      { id:2, name:'Tramadol Pink 100mg', price:249, img:'images/trakem-100-mg-tramadol-tablet--218.jpg' }
    ];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stmt = 'INSERT INTO products (id,name,price,img) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING';
      for (const p of sample) await client.query(stmt, [p.id,p.name,p.price,p.img]);
      await client.query('COMMIT');
      console.log('Seeded sample products');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Seeding error', err.message);
    } finally {
      client.release();
    }
  }
}

app.get('/api/products', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM products ORDER BY id'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Unable to fetch products' }); }
});

app.post('/api/social-clicks', async (req, res) => {
  const { platform, fullDate, page, device, browser } = req.body;
  try {
    const result = await pool.query('INSERT INTO social_clicks (platform, fullDate, date, page, device, browser) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [platform, fullDate || new Date().toISOString(), new Date().toLocaleString(), page || '', device || '', browser || '']);
    res.json({ id: result.rows[0].id });
  } catch (err) { res.status(500).json({ error: 'Unable to save social click' }); }
});

app.get('/api/social-clicks', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM social_clicks ORDER BY id DESC LIMIT 200'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Unable to fetch social clicks' }); }
});

app.post('/api/orders', async (req, res) => {
  const { id, billing, items, itemCount, subtotal, shipping, tax, total, date } = req.body;
  const orderId = id || Date.now().toString();
  try {
    await pool.query('INSERT INTO orders (id,billing,itemCount,subtotal,shipping,tax,total,date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING', [orderId, billing || {}, itemCount, subtotal, shipping, tax, total, date || new Date().toISOString()]);
    if (Array.isArray(items) && items.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const stmt = 'INSERT INTO order_items (order_id,name,pillQty,linePrice) VALUES ($1,$2,$3,$4)';
        for (const it of items) await client.query(stmt, [orderId, it.name, it.pillQty || 0, it.linePrice || 0]);
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); console.error('order items error', err.message); }
      finally { client.release(); }
    }
    res.json({ id: orderId });
  } catch (err) { res.status(500).json({ error: 'Unable to save order', detail: err.message }); }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders ORDER BY date DESC LIMIT 100');
    if (!rows.length) return res.json([]);
    const orderIds = rows.map(r => r.id);
    const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY id ASC', [orderIds]);
    const itemsByOrder = itemsRes.rows.reduce((acc, it) => { acc[it.order_id] = acc[it.order_id] || []; acc[it.order_id].push(it); return acc; }, {});
    const orders = rows.map(r => ({ ...r, items: itemsByOrder[r.id] || [], billing: r.billing }));
    res.json(orders);
  } catch (err) { res.status(500).json({ error: 'Unable to fetch orders' }); }
});

app.delete('/api/orders', async (req, res) => {
try {
await db.run('DELETE FROM orders');
res.json({
success: true,
message: 'All orders deleted'
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

app.delete('/api/social-clicks', async (req, res) => {
try {
await db.run('DELETE FROM social_clicks');
res.json({
success: true,
message: 'All social clicks deleted'
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Delete scripts - for testing only, not exposed in production
app.delete('/api/orders', async (req, res) => {
  try {
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');

    res.json({
      success: true,
      message: 'All orders deleted'
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.delete('/api/social-clicks', async (req, res) => {
  try {
    await pool.query('DELETE FROM social_clicks');

    res.json({
      success: true,
      message: 'All social clicks deleted'
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

(async function init() {
  try { await createTables(); await seedProductsIfEmpty(); app.listen(PORT, () => console.log(`Rx House backend (Postgres) started at http://localhost:${PORT}`)); }
  catch (err) { console.error('Initialization failed', err); process.exit(1); }
})();
