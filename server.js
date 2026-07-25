const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const nodemailer = require("nodemailer");

if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://pharmacies.doctor",
        "https://www.pharmacies.doctor",
        "https://pd.pharmacies.doctor",
        "http://192.168.1.7:5500",
    ],
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
    credentials: true
}));

// Must be set to allow larger JSON image payloads
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    console.log('Origin:', req.headers.origin);
    next();
});

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rxhouse';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    logger: true,
    debug: true
});

transporter.verify((err)=>{
    if(err){
        console.log("Mail Error", err);
    }else{
        console.log("Mail Ready");
    }
});

// Helper function to extract YouTube video ID
function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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

  await pool.query(`
  CREATE TABLE IF NOT EXISTS blogs (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      excerpt TEXT,
      content TEXT NOT NULL,
      featured_image TEXT,
      category VARCHAR(100),
      author VARCHAR(100) DEFAULT 'RxHouse',
      tags TEXT,
      is_published BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        subject TEXT,
        message TEXT NOT NULL,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

app.get("/debug/orders", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM orders");
        res.json(result.rows);
    } catch (e) {
        res.status(500).json(e);
    }
});

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
    const billingData = billing || {};

const html = `
<h2>New Rx House Order</h2>
<h3>Customer</h3>
<table border="1" cellpadding="8">
<tr><td>Name</td><td>${billingData.firstName} ${billingData.lastName}</td></tr>
<tr><td>Email</td><td>${billingData.email}</td></tr>
<tr><td>Phone</td><td>${billingData.phone}</td></tr>
<tr><td>Street</td><td>${billingData.street}</td></tr>
<tr><td>City</td><td>${billingData.city}</td></tr>
<tr><td>State</td><td>${billingData.state}</td></tr>
<tr><td>Zip</td><td>${billingData.zip}</td></tr>
<tr><td>Country</td><td>${billingData.country}</td></tr>
</table>
<br>
<h3>Medicines</h3>
<table border="1" cellpadding="8">
<tr>
<th>Name</th>
<th>Qty</th>
<th>Price</th>
</tr>
${items.map(i=>`
<tr>
<td>${i.name}</td>
<td>${i.pillQty}</td>
<td>$${i.linePrice}</td>
</tr>
`).join("")}
</table>
<h3>Total</h3>
<p>
Subtotal : $${subtotal}
<br>
Tax : $${tax}
<br>
Grand Total : $${total}
</p>
<p>
Notes :
${billingData.notes || "None"}
</p>
`;

await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject: `New Order ${orderId}`,
    html
});

if(billingData.email){
await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: billingData.email,
    subject:"Order Confirmation",
    html:`
    <h2>Thank You</h2>
    <p>Your order has been received.</p>
    <p>One of our representatives will contact you shortly.</p>
    <p>Order ID : ${orderId}</p>
    `
});
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
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');
    res.json({ success: true, message: 'All orders deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/social-clicks', async (req, res) => {
  try {
    await pool.query('DELETE FROM social_clicks');
    res.json({ success: true, message: 'All social clicks deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET PUBLIC BLOGS
app.get("/api/blogs", async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, title, slug, excerpt, featured_image, category, author, created_at 
            FROM blogs 
            WHERE is_published = true 
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Unable to fetch blogs" });
    }
});

// GET SINGLE BLOG API
app.get("/api/blogs/:slug", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM blogs WHERE slug=$1", [req.params.slug]);
        if (!rows.length) {
            return res.status(404).json({ error: "Blog not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// GET ALL BLOGS (Drafts + Published for admin)
app.get("/api/admin/blogs", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM blogs ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Unable to fetch all blogs" });
    }
});

// POST BLOG
app.post("/api/blogs", async (req, res) => {
    const { title, slug, excerpt, content, featured_image, category, author, tags, is_published } = req.body;
    try {
        const query = `
            INSERT INTO blogs (title, slug, excerpt, content, featured_image, category, author, tags, is_published)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            title, 
            slug, 
            excerpt || '', 
            content, 
            featured_image || '', 
            category || '', 
            author || 'RxHouse', 
            tags || '', 
            is_published !== undefined ? is_published : true
        ];
        const { rows } = await pool.query(query, values);
        res.status(201).json({ success: true, message: "Blog post created successfully!", data: rows[0] });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(400).json({ error: "A blog post with this URL slug already exists." });
        }
        res.status(500).json({ error: "Unable to create blog post on the server." });
    }
});

// PUT BLOG
app.put("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;
    const { title, slug, excerpt, content, featured_image, category, author, tags, is_published } = req.body;
    try {
        const query = `
            UPDATE blogs
            SET title = $1, slug = $2, excerpt = $3, content = $4, featured_image = $5, 
                category = $6, author = $7, tags = $8, is_published = $9, updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *
        `;
        const values = [title, slug, excerpt, content, featured_image, category, author, tags, is_published, id];
        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        res.json({ success: true, message: "Blog updated successfully", data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Unable to update blog post" });
    }
});

app.post("/api/contact", async (req, res) => {
    const { first_name, last_name, email, phone, subject, message } = req.body;

    if (!first_name || !last_name || !email || !message) {
        return res.status(400).json({ success: false, error: "Please fill in all required fields." });
    }

    try {
        await pool.query(`
            INSERT INTO contact_messages (first_name, last_name, email, phone, subject, message, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [first_name, last_name, email, phone || '', subject || '', message, req.ip]);

        // Email to admin
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.EMAIL_TO,
            subject: `New Contact Form: ${subject || 'General Inquiry'}`,
            html: `
                <h2>New Contact Message</h2>
                <p><b>Name:</b> ${first_name} ${last_name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Phone:</b> ${phone || 'Not provided'}</p>
                <p><b>Subject:</b> ${subject}</p>
                <p><b>Message:</b></p>
                <blockquote style="background:#f4f4f4; padding:10px;">${message.replace(/\n/g, '<br>')}</blockquote>
            `
        });

        res.json({
            success: true,
            message: "Your message has been sent successfully!"
        });

    } catch(err) {
        console.error("Contact API Error:", err);
        res.status(500).json({ success: false, error: "Server error handling contact submission." });
    }
});

app.get("/api/contact", async(req,res)=>{
    try{
        const {rows}=await pool.query(`
            SELECT *
            FROM contact_messages
            ORDER BY created_at DESC
        `);
        res.json(rows);
    }catch(err){
        res.status(500).json({ error:err.message });
    }
});

app.get("/api/contact/stats", async(req,res)=>{
    try{
        const total=await pool.query(`
            SELECT COUNT(*) total
            FROM contact_messages
        `);
        const today=await pool.query(`
            SELECT COUNT(*) today
            FROM contact_messages
            WHERE DATE(created_at)=CURRENT_DATE
        `);
        res.json({
            total:Number(total.rows[0].total),
            today:Number(today.rows[0].today)
        });
    }catch(err){
        res.status(500).json({ error:err.message });
    }
});

// NATIVE BASE64 IMAGE FILE SAVING
app.use('/images', express.static(path.join(__dirname, 'images')));

app.post('/api/upload-base64', (req, res) => {
    const { image } = req.body;
    if (!image) {
        return res.status(400).json({ error: 'No image data provided' });
    }
    try {
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid image data' });
        }

        const ext = matches[1].split('/')[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        const filePath = path.join(imagesDir, fileName);

        fs.writeFileSync(filePath, buffer);
        res.json({ success: true, imageUrl: `images/${fileName}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to write file to disk' });
    }
});

// DELETE BLOG
app.delete("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query("DELETE FROM blogs WHERE id = $1", [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        res.json({ success: true, message: "Blog deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Unable to delete blog post" });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.delete("/api/contact", async (req, res) => {
    try {
        await pool.query("TRUNCATE TABLE contact_messages RESTART IDENTITY");
        res.json({ success: true, message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// FRONTEND ROUTING & CLEAN URLS (SSR META)
// ==========================================

// 1. Serve static files (HTML, CSS, JS, images) from root
app.use(express.static(__dirname));

// 2. Clean URL for main blog page (/blog -> blog.html)
app.get('/blog', (req, res) => {
    let blogHtmlPath = path.join(__dirname, 'blog.html');
    if (!fs.existsSync(blogHtmlPath)) {
        blogHtmlPath = path.join(__dirname, '../public_html/blog.html');
    }
    res.sendFile(blogHtmlPath);
});

// 3. Clean URL for single blog posts with SERVER-SIDE META INJECTION
app.get("/blog/:slug", async (req, res) => {
    try {
        const slug = req.params.slug;

        const { rows } = await pool.query(
            "SELECT * FROM blogs WHERE slug=$1 AND is_published=true LIMIT 1",
            [slug]
        );

        if (!rows.length) {
            return res.status(404).send("Blog post not found");
        }

        const blog = rows[0];
        const siteUrl = "https://pharmacies.doctor";

        // Determine correct template file location
        let templatePath = path.join(__dirname, 'blog-post.html');
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(__dirname, '../public_html/blog-post.html');
        }

        if (!fs.existsSync(templatePath)) {
            return res.status(500).send("Blog post HTML template not found on server.");
        }

        let html = fs.readFileSync(templatePath, "utf8");

        // Format Image URL (Handles YouTube videos vs uploaded images vs fallback logo)
        let image = `${siteUrl}/images/pdlogo.png`;

        if (blog.featured_image) {
            const youtubeId = getYouTubeId(blog.featured_image);
            if (youtubeId) {
                image = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            } else if (blog.featured_image.startsWith("http")) {
                image = blog.featured_image;
            } else {
                image = `${siteUrl}/${blog.featured_image.replace(/^\/+/, "")}`;
            }
        }

        // Sanitize strings for safe HTML attribute replacement
        const safeTitle = (blog.title || "Pharmacies Doctor Blog").replace(/"/g, '&quot;');
        const safeDescription = (blog.excerpt || blog.description || blog.content || '')
            .replace(/<[^>]*>?/gm, '')
            .replace(/"/g, '&quot;')
            .substring(0, 160)
            .trim();

        const canonicalUrl = `${siteUrl}/blog/${blog.slug}`;

        // 1. Replace placeholder markers if present
        html = html.replace(/BLOG_TITLE/g, safeTitle);
        html = html.replace(/BLOG_DESCRIPTION/g, safeDescription);
        html = html.replace(/BLOG_CANONICAL/g, canonicalUrl);
        html = html.replace(/BLOG_IMAGE/g, image);

        // 2. Dynamic Tag Replacement via Regex (Guarantees Open Graph / WhatsApp picks it up)
        html = html.replace(/<title.*?>.*?<\/title>/i, `<title>${safeTitle} | Pharmacies Doctor</title>`);
        
        // Open Graph Regex Replacement
        html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"/i, `<meta property="og:title" content="${safeTitle} | Pharmacies Doctor"`);
        html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"/i, `<meta property="og:description" content="${safeDescription}"`);
        html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"/i, `<meta property="og:image" content="${image}"`);
        html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"/i, `<meta property="og:url" content="${canonicalUrl}"`);

        // Twitter Card Regex Replacement
        html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"/i, `<meta name="twitter:title" content="${safeTitle} | Pharmacies Doctor"`);
        html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"/i, `<meta name="twitter:description" content="${safeDescription}"`);
        html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"/i, `<meta name="twitter:image" content="${image}"`);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (err) {
        console.error("Error serving blog post with SSR meta:", err);
        res.status(500).send("Server Error serving blog post.");
    }
});

// 4. Catch-all fallback for main site sections
app.get('/', (req, res) => {
    let indexHtmlPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
        indexHtmlPath = path.join(__dirname, '../public_html/index.html');
    }
    res.sendFile(indexHtmlPath);
});

(async function init() {
  try { 
    await createTables(); 
    await seedProductsIfEmpty(); 
    app.listen(PORT, () => console.log(`Rx House backend (Postgres) started at http://localhost:${PORT}`)); 
  } catch (err) { 
    console.error('Initialization failed', err); 
    process.exit(1); 
  }
})();


// fetch("https://pd.pharmacies.doctor/api/orders", {
//     method: "DELETE"
// })
// .then(res => res.json())
// .then(data => {
//     console.log("Orders deleted:", data);
// })
// .catch(console.error);
// Delete all social clicks
// fetch("https://pd.pharmacies.doctor/api/social-clicks", {
//     method: "DELETE"
// })
// .then(res => res.json())
// .then(data => {
//     console.log("Social clicks deleted:", data);
// })
// .catch(console.error);
// Delete both at once
// Promise.all([
//     fetch("https://pd.pharmacies.doctor/api/orders", {
//         method: "DELETE"
//     }).then(r => r.json()),

//     fetch("https://pd.pharmacies.doctor/api/social-clicks", {
//         method: "DELETE"
//     }).then(r => r.json())
// ])
// .then(results => {
//     console.log("Done:", results);
//     alert("All orders and social clicks deleted.");
// })
// .catch(console.error);