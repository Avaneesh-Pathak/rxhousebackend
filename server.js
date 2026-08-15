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