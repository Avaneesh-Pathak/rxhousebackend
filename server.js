const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const app = express();
const PORT = process.env.PORT || 3000;

const SITE_URL = "https://pharmacies.doctor";
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/rxhouse";

app.use(
    cors({
        origin: [
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://pharmacies.doctor",
            "https://www.pharmacies.doctor",
            "https://pd.pharmacies.doctor",
            "http://192.168.1.7:5500",
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    if (req.headers.origin) {
        console.log("Origin:", req.headers.origin);
    }
    next();
});

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/images", express.static(path.join(__dirname, "images")));

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    logger: true,
    debug: true,
});
transporter.verify((error) => {
    if (error) {
        console.error("SMTP VERIFICATION FAILED:");
        console.error(error);
    } else {
        console.log("SMTP SERVER READY");
    }
});
function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

// ------------------------------------------------------------
// 301 PERMANENT REDIRECTS FOR BLOGS (REDIRECT pd. SUBDOMAIN TO MAIN DOMAIN)
// ------------------------------------------------------------

app.get("/blog-post.html", (req, res) => {
    const slug = req.query.slug;
    if (slug) {
        return res.redirect(301, `${SITE_URL}/blog/${encodeURIComponent(slug)}`);
    }
    return res.redirect(301, `${SITE_URL}/blog`);
});

app.get("/blog/:slug", (req, res) => {
    return res.redirect(301, `${SITE_URL}/blog/${encodeURIComponent(req.params.slug)}`);
});

app.get("/blog", (req, res) => {
    return res.redirect(301, `${SITE_URL}/blog`);
});

// ------------------------------------------------------------
// REST APIs (Used by Main Domain Frontend)
// ------------------------------------------------------------

app.get("/api/products", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Unable to fetch products" });
    }
});
// ------------------------------------------------------------
// ORDER APIs
// ------------------------------------------------------------

// GET /api/orders
app.get("/api/orders", async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                billing,
                itemCount,
                subtotal,
                shipping,
                tax,
                total,
                date
            FROM orders
            ORDER BY date DESC
        `);

        const orderIds = rows.map(order => order.id);

        if (orderIds.length === 0) {
            return res.json([]);
        }

        const { rows: itemRows } = await pool.query(`
            SELECT
                order_id,
                name,
                "pillqty",
                "lineprice"
            FROM order_items
            WHERE order_id = ANY($1::text[])
            ORDER BY id
        `, [orderIds]);

        const itemsByOrder = {};

        for (const item of itemRows) {
            if (!itemsByOrder[item.order_id]) {
                itemsByOrder[item.order_id] = [];
            }

            itemsByOrder[item.order_id].push({
                name: item.name,
                pillQty: item.pillqty,
                linePrice: Number(item.lineprice)
            });
        }

        const result = rows.map(order => ({
            ...order,
            subtotal: Number(order.subtotal),
            shipping: Number(order.shipping),
            tax: Number(order.tax),
            total: Number(order.total),
            items: itemsByOrder[order.id] || []
        }));

        return res.json(result);

    } catch (err) {
        console.error("GET ORDERS ERROR:", err);

        return res.status(500).json({
            error: "Unable to fetch orders",
            detail: err.message
        });
    }
});


// POST /api/orders
app.post("/api/orders", async (req, res) => {
    const client = await pool.connect();

    try {
        const order = req.body;

        if (!order || !order.id) {
            return res.status(400).json({
                error: "Invalid order data",
                detail: "Order ID is required"
            });
        }

        if (!order.billing) {
            return res.status(400).json({
                error: "Invalid order data",
                detail: "Billing information is required"
            });
        }

        if (!Array.isArray(order.items) || order.items.length === 0) {
            return res.status(400).json({
                error: "Invalid order data",
                detail: "Order must contain at least one item"
            });
        }

        await client.query("BEGIN");

        // ----------------------------------------------------
        // SAVE ORDER
        // ----------------------------------------------------

        await client.query(
            `
            INSERT INTO orders (
                id,
                billing,
                itemCount,
                subtotal,
                shipping,
                tax,
                total,
                date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id)
            DO UPDATE SET
                billing = EXCLUDED.billing,
                itemCount = EXCLUDED.itemCount,
                subtotal = EXCLUDED.subtotal,
                shipping = EXCLUDED.shipping,
                tax = EXCLUDED.tax,
                total = EXCLUDED.total,
                date = EXCLUDED.date
            `,
            [
                String(order.id),
                JSON.stringify(order.billing),
                Number(order.itemCount || order.items.length),
                Number(order.subtotal || 0),
                Number(order.shipping || 0),
                Number(order.tax || 0),
                Number(order.total || 0),
                order.date || new Date().toISOString()
            ]
        );

        // ----------------------------------------------------
        // REMOVE OLD ITEMS WHEN UPDATING AN EXISTING ORDER
        // ----------------------------------------------------

        await client.query(
            `DELETE FROM order_items WHERE order_id = $1`,
            [String(order.id)]
        );

        // ----------------------------------------------------
        // SAVE ORDER ITEMS
        // ----------------------------------------------------

        for (const item of order.items) {
            await client.query(
                `
                INSERT INTO order_items (
                    order_id,
                    name,
                    pillQty,
                    linePrice
                )
                VALUES ($1, $2, $3, $4)
                `,
                [
                    String(order.id),
                    String(item.name || ""),
                    Number(item.pillQty || item.qty || 0),
                    Number(item.linePrice || item.price || 0)
                ]
            );
        }

        await client.query("COMMIT");

        // ----------------------------------------------------
        // EMAIL
        // ----------------------------------------------------

        const billing = order.billing || {};

        const itemHtml = order.items
            .map(item => `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #ddd;">
                        ${escapeHtml(item.name)}
                    </td>
                    <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">
                        ${Number(item.pillQty || item.qty || 0)}
                    </td>
                    <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">
                        $${Number(item.linePrice || item.price || 0).toFixed(2)}
                    </td>
                </tr>
            `)
            .join("");

        const customerName =
            `${billing.firstName || ""} ${billing.lastName || ""}`.trim();

        const emailHtml = `
            <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
                <h2>New Order #${escapeHtml(order.id)}</h2>

                <h3>Customer Information</h3>

                <p>
                    <strong>Name:</strong>
                    ${escapeHtml(customerName || billing.firstName || "")}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${escapeHtml(billing.email || "")}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${escapeHtml(billing.phone || "")}
                </p>

                <p>
                    <strong>Address:</strong><br>
                    ${escapeHtml(billing.street || "")}<br>
                    ${escapeHtml(billing.city || "")},
                    ${escapeHtml(billing.state || "")}
                    ${escapeHtml(billing.zip || "")}
                </p>

                <h3>Order Items</h3>

                <table
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    style="border-collapse:collapse;"
                >
                    <thead>
                        <tr>
                            <th style="padding:8px;text-align:left;border-bottom:2px solid #111;">
                                Product
                            </th>
                            <th style="padding:8px;text-align:center;border-bottom:2px solid #111;">
                                Qty
                            </th>
                            <th style="padding:8px;text-align:right;border-bottom:2px solid #111;">
                                Price
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        ${itemHtml}
                    </tbody>
                </table>

                <h3>Order Summary</h3>

                <p>
                    <strong>Subtotal:</strong>
                    $${Number(order.subtotal || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Shipping:</strong>
                    $${Number(order.shipping || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Tax:</strong>
                    $${Number(order.tax || 0).toFixed(2)}
                </p>

                <p style="font-size:18px;">
                    <strong>Total:</strong>
                    $${Number(order.total || 0).toFixed(2)}
                </p>
            </div>
        `;

        await transporter.sendMail({
            from: `"USA MediHub Orders" <${process.env.SMTP_USER}>`,
            to: process.env.EMAIL_TO || process.env.SMTP_USER,
            replyTo: billing.email || process.env.SMTP_USER,
            subject: `New Order #${order.id}`,
            html: emailHtml
        });

        return res.status(201).json({
            success: true,
            message: "Order saved successfully",
            orderId: order.id
        });

    } catch (err) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("ROLLBACK ERROR:", rollbackError);
        }

        console.error("ORDER ERROR:", err);

        return res.status(500).json({
            error: "Unable to save order",
            detail: err.message
        });

    } finally {
        client.release();
    }
});
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
        res.status(500).json({ error: "Unable to fetch blogs" });
    }
});

app.get("/api/blogs/:slug", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM blogs WHERE slug = $1", [req.params.slug]);
        if (!rows.length) {
            return res.status(404).json({ error: "Blog not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.post("/api/blogs", async (req, res) => {
    const { title, slug, excerpt, content, featured_image, category, author, tags, is_published } = req.body;
    try {
        const query = `
            INSERT INTO blogs (title, slug, excerpt, content, featured_image, category, author, tags, is_published)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            title, slug, excerpt || "", content, featured_image || "", category || "",
            author || "Pharmacies Doctor", tags || "", is_published !== undefined ? is_published : true
        ];
        const { rows } = await pool.query(query, values);
        res.status(201).json({ success: true, message: "Blog post created successfully!", data: rows[0] });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ error: "A blog post with this URL slug already exists." });
        }
        res.status(500).json({ error: "Unable to create blog post on the server." });
    }
});

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
        if (!rows.length) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        res.json({ success: true, message: "Blog updated successfully", data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Unable to update blog post" });
    }
});

app.delete("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query("DELETE FROM blogs WHERE id = $1", [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        res.json({ success: true, message: "Blog deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Unable to delete blog post" });
    }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

(async function init() {
    try {
        await createTables();
        app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
    } catch (err) {
        console.error("Initialization failed:", err);
        process.exit(1);
    }
})();