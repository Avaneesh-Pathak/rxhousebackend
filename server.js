const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { normalizeOrderItems, roundMoney } = require("./catalog-pricing");

// Hosting-panel values take precedence. A server-local .env also works in
// production, regardless of the process manager's working directory.
require("dotenv").config({ path: path.join(__dirname, ".env"), override: false, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
let databaseReady = false;
let databaseInitializing = false;
let databaseRetryTimer = null;
let shuttingDown = false;

// ============================================================
// CONFIGURATION
// ============================================================

const SITE_URL =
    process.env.SITE_URL ||
    "https://pharmacies.doctor";

const BACKEND_URL =
    process.env.BACKEND_URL ||
    "https://pd.pharmacies.doctor";

// Keep uploaded media outside the Git checkout in production when possible.
// Example: set UPLOAD_DIR to a persistent Hostinger directory.
const DEFAULT_UPLOAD_DIR =
    process.env.NODE_ENV === "production"
        ? path.resolve(__dirname, "..", "pharmacies-doctor-data", "images")
        : path.join(__dirname, "images");

const UPLOAD_DIR =
    process.env.UPLOAD_DIR ||
    DEFAULT_UPLOAD_DIR;

// Uploaded media is runtime/user data. In production the default location is
// deliberately outside the application directory so Git deployments cannot
// replace or delete uploaded images. Set UPLOAD_DIR explicitly on Hostinger
// if you use a different persistent volume/path.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/*
 * IMPORTANT:
 * The public website is pharmacies.doctor.
 * The Node/Express backend is pd.pharmacies.doctor.
 *
 * SSR on /blog/:slug fetches the raw template from the backend
 * itself. Keeping this URL on the backend avoids a dependency
 * on the static frontend host.
 */
const BLOG_TEMPLATE_URL =
    process.env.BLOG_TEMPLATE_URL ||
    `${BACKEND_URL}/blog-post.html`;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("DATABASE_URL is required. Configure it in the environment.");
    process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "";
const ADMIN_TOKEN_TTL_SECONDS = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 8 * 60 * 60);
const ORDER_TAX_RATE = Number(process.env.ORDER_TAX_RATE || 0.06);
const ORDER_SHIPPING_FLAT = Number(process.env.ORDER_SHIPPING_FLAT || 0);

if (!Number.isInteger(ADMIN_TOKEN_TTL_SECONDS) || ADMIN_TOKEN_TTL_SECONDS < 60 || ADMIN_TOKEN_TTL_SECONDS > 86400) {
    throw new Error("ADMIN_TOKEN_TTL_SECONDS must be a whole number between 60 and 86400.");
}

if (!Number.isFinite(ORDER_TAX_RATE) || ORDER_TAX_RATE < 0 || ORDER_TAX_RATE > 1) {
    throw new Error("ORDER_TAX_RATE must be a number between 0 and 1.");
}
if (!Number.isFinite(ORDER_SHIPPING_FLAT) || ORDER_SHIPPING_FLAT < 0) {
    throw new Error("ORDER_SHIPPING_FLAT must be a non-negative number.");
}

if (process.env.NODE_ENV === "production" && (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET)) {
    console.warn("ADMIN_PASSWORD and ADMIN_TOKEN_SECRET must be configured to use admin APIs in production.");
}


// ============================================================
// CORS
// ============================================================

const ALLOWED_ORIGINS = new Set(
    (process.env.CORS_ORIGINS ||
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,https://pharmacies.doctor,https://www.pharmacies.doctor")
        .split(",")
        .map((value) => value.trim().replace(/\/+$/, ""))
        .filter(Boolean)
);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || ALLOWED_ORIGINS.has(origin)) {
                return callback(null, true);
            }
            const error = new Error("CORS origin not allowed");
            error.status = 403;
            error.code = "ORIGIN_NOT_ALLOWED";
            return callback(error);
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
        credentials: true,
        maxAge: 86400,
    })
);

// ============================================================
// BODY PARSING
// ============================================================

app.use(
    express.json({
        limit: "10mb",
    })
);

// Production-safe defaults. Keep HTML CSP on the frontend host where its
// third-party resources are known; the API uses response headers that are
// safe for JSON/static resources without breaking the existing frontend.
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
    const requestId = req.get("X-Request-ID") || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
});

// Lightweight in-process rate limiter for public mutation endpoints. It is
// intentionally dependency-free and acts as a safety net; use a proxy/WAF
// rate limit as the authoritative distributed limit in production.
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 120;
function publicRateLimit(req, res, next) {
    if (req.method === "GET" || req.path === "/health" || req.path === "/health/ready") {
        return next();
    }
    const key = req.ip || "unknown";
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
        rateBuckets.set(key, { startedAt: now, count: 1 });
        return next();
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    return next();
}
app.use("/api", publicRateLimit);

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

const adminLoginBuckets = new Map();
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_LIMIT = 10;

function adminLoginRateLimit(req, res, next) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const bucket = adminLoginBuckets.get(key);

    if (!bucket || now - bucket.startedAt >= ADMIN_LOGIN_WINDOW_MS) {
        adminLoginBuckets.set(key, { startedAt: now, count: 1 });
        return next();
    }

    bucket.count += 1;
    if (bucket.count > ADMIN_LOGIN_LIMIT) {
        res.setHeader("Retry-After", String(Math.ceil(ADMIN_LOGIN_WINDOW_MS / 1000)));
        return res.status(429).json({ error: "Too many admin login attempts. Please try again later." });
    }
    return next();
}

function secureStringEqual(a, b) {
    const left = crypto.createHash("sha256").update(String(a || "")).digest();
    const right = crypto.createHash("sha256").update(String(b || "")).digest();
    return crypto.timingSafeEqual(left, right);
}

function signAdminToken() {
    const payload = Buffer.from(JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SECONDS,
        nonce: crypto.randomBytes(16).toString("hex"),
    })).toString("base64url");

    const signature = crypto
        .createHmac("sha256", ADMIN_TOKEN_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
    if (!ADMIN_TOKEN_SECRET || !token || !token.includes(".")) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    if (!payload || !signature) return false;

    const expected = crypto
        .createHmac("sha256", ADMIN_TOKEN_SECRET)
        .update(payload)
        .digest("base64url");

    if (!secureStringEqual(signature, expected)) return false;

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return Number.isFinite(data.exp) && data.exp > Math.floor(Date.now() / 1000);
    } catch (_) {
        return false;
    }
}

function requireAdmin(req, res, next) {
    const auth = req.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match || !verifyAdminToken(match[1])) {
        return res.status(401).json({ code: "ADMIN_AUTH_REQUIRED", error: "Admin authentication required." });
    }
    return next();
}

app.post("/api/admin/login", adminLoginRateLimit, (req, res) => {
    if (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
        return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED", error: "Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_TOKEN_SECRET on the backend, then restart it." });
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password || !secureStringEqual(password, ADMIN_PASSWORD)) {
        return res.status(401).json({ code: "INVALID_CREDENTIALS", error: "Invalid admin credentials." });
    }

    return res.json({
        token: signAdminToken(),
        expiresIn: ADMIN_TOKEN_TTL_SECONDS,
    });
});

// Verifies the token without querying the database or exposing customer data.
app.get("/api/admin/session", requireAdmin, (req, res) => {
    res.json({ authenticated: true });
});

function cleanText(value, maxLength = 500) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value) {
    const email = cleanText(value, 254);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateOrderPayload(body) {
    const billing = body && typeof body.billing === "object" ? body.billing : null;
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!billing) return "Billing information is required.";
    if (!isValidEmail(billing.email)) return "A valid email address is required.";
    if (!cleanText(billing.firstName, 80) || !cleanText(billing.lastName, 80)) return "Customer name is required.";
    if (!cleanText(billing.phone, 40)) return "Phone number is required.";
    if (!cleanText(billing.street, 200) || !cleanText(billing.city, 120) || !cleanText(billing.state, 120) || !cleanText(billing.zip, 30)) {
        return "A complete shipping address is required.";
    }

    const limits = {
        firstName: 80,
        lastName: 80,
        email: 254,
        phone: 40,
        street: 200,
        city: 120,
        state: 120,
        zip: 30,
        country: 120,
        notes: 5000,
    };
    for (const [field, max] of Object.entries(limits)) {
        if (String(billing[field] ?? "").length > max) return `${field} is too long.`;
    }

    try {
        normalizeOrderItems(items);
    } catch (error) {
        return error.message || "Invalid order items.";
    }

    return null;
}

function normalizeBilling(billing) {
    return {
        firstName: cleanText(billing?.firstName, 80),
        lastName: cleanText(billing?.lastName, 80),
        email: cleanText(billing?.email, 254).toLowerCase(),
        phone: cleanText(billing?.phone, 40),
        street: cleanText(billing?.street, 200),
        city: cleanText(billing?.city, 120),
        state: cleanText(billing?.state, 120),
        zip: cleanText(billing?.zip, 30),
        country: cleanText(billing?.country || "United States", 120),
        notes: cleanText(billing?.notes, 5000),
    };
}

function sanitizeBlogHtml(html) {
    const cheerio = require("cheerio");
    const $ = cheerio.load(`<div id="pd-blog-root">${String(html || "")}</div>`, null, false);
    $("script, style, object, embed, form, input, button, meta, link").remove();
    $("*").each((_, el) => {
        const attrs = { ...(el.attribs || {}) };
        for (const [name, value] of Object.entries(attrs)) {
            const lower = name.toLowerCase();
            if (lower.startsWith("on") || lower === "srcdoc") {
                $(el).removeAttr(name);
                continue;
            }
            if (["href", "src", "xlink:href"].includes(lower) && /^\s*javascript:/i.test(String(value || ""))) {
                $(el).removeAttr(name);
            }
        }
    });
    return $("#pd-blog-root").html() || "";
}

// ============================================================
// REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        console.log(
            JSON.stringify({
                time: new Date().toISOString(),
                requestId: req.requestId,
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
                ip: req.ip,
            })
        );
    });
    next();
});

// ============================================================
// STATIC ASSETS
// ============================================================

app.use(
    "/css",
    express.static(path.join(__dirname, "css"))
);

app.use(
    "/js",
    express.static(path.join(__dirname, "js"))
);

app.use(
    "/images",
    express.static(UPLOAD_DIR, {
        maxAge: "30d",
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
            res.setHeader("Cache-Control", "public, max-age=2592000");
            res.setHeader("Content-Disposition", "inline");
        }
    })
);

// ============================================================
// DATABASE
// ============================================================

// ============================================================
// DATABASE
// ============================================================

function getDatabaseSSL() {
    try {
        const dbUrl = new URL(DATABASE_URL);

        const hostname = dbUrl.hostname.toLowerCase();

        // Local PostgreSQL should NEVER require SSL
        const isLocalDatabase =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1";

        if (isLocalDatabase) {
            console.log("Database: LOCAL PostgreSQL");
            console.log("Database SSL: DISABLED");

            return false;
        }

        // Remote production databases
        console.log("Database: REMOTE PostgreSQL");
        console.log("Database SSL: ENABLED");

        return {
            rejectUnauthorized: false,
        };
    } catch (error) {
        console.error(
            "Unable to parse DATABASE_URL:",
            error.message
        );

        // Safe fallback for local development
        return false;
    }
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: getDatabaseSSL(),
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.message);
});

// CORS preflights and login are handled before this database readiness gate.
// Never accept orders or serve admin data before schema initialization succeeds.
app.use("/api", (req, res, next) => {
    if (!databaseReady) {
        res.setHeader("Retry-After", "10");
        return res.status(503).json({
            code: "DATABASE_UNAVAILABLE",
            error: "The database is temporarily unavailable. Please try again shortly.",
        });
    }
    next();
});

// ============================================================
// EMAIL / SMTP
// ============================================================

const SMTP_HOST =
    process.env.SMTP_HOST || "smtp.gmail.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 465);

const SMTP_SECURE =
    String(
        process.env.SMTP_SECURE || "true"
    ).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER;

const SMTP_PASS =
    process.env.SMTP_PASS;

const EMAIL_TO =
    process.env.EMAIL_TO;

let transporter = null;

// Only create transporter when credentials exist.
if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,

        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },

        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,

        logger: false,
        debug: false,
    });

    // SMTP verification must NEVER crash the application.
    transporter.verify((error) => {
        if (error) {
            console.error(
                "================================================="
            );

            console.error(
                "SMTP VERIFICATION FAILED"
            );

            console.error(
                "SMTP HOST:",
                SMTP_HOST
            );

            console.error(
                "SMTP PORT:",
                SMTP_PORT
            );

            console.error(
                "SMTP SECURE:",
                SMTP_SECURE
            );

            console.error(
                "SMTP USER:",
                SMTP_USER
                    ? SMTP_USER
                    : "NOT CONFIGURED"
            );

            console.error(
                "SMTP PASSWORD:",
                SMTP_PASS
                    ? "CONFIGURED"
                    : "NOT CONFIGURED"
            );

            console.error(
                "EMAIL TO:",
                EMAIL_TO
                    ? EMAIL_TO
                    : "NOT CONFIGURED"
            );

            console.error(
                "SMTP ERROR:",
                error.message
            );

            console.error(
                "================================================="
            );
        } else {
            console.log(
                "================================================="
            );

            console.log(
                "SMTP SERVER READY"
            );

            console.log(
                "SMTP HOST:",
                SMTP_HOST
            );

            console.log(
                "SMTP PORT:",
                SMTP_PORT
            );

            console.log(
                "SMTP SECURE:",
                SMTP_SECURE
            );

            console.log(
                "SMTP USER:",
                SMTP_USER
            );

            console.log(
                "================================================="
            );
        }
    });
} else {
    console.error(
        "================================================="
    );

    console.error(
        "SMTP NOT CONFIGURED"
    );

    console.error(
        "SMTP_USER or SMTP_PASS is missing."
    );

    console.error(
        "Order processing will continue, but email notifications will be skipped."
    );

    console.error(
        "================================================="
    );
}

// ============================================================
// HELPERS
// ============================================================

function getYouTubeId(url) {
    if (!url) {
        return null;
    }

    const regExp =
        /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;

    const match = url.match(regExp);

    return match &&
        match[2] &&
        match[2].length === 11
        ? match[2]
        : null;
}

function escapeHtml(text) {
    if (!text) {
        return "";
    }

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function stripHtml(text) {
    if (!text) {
        return "";
    }

    return String(text)
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeHtmlAttribute(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ============================================================
// DATABASE TABLE CREATION
// ============================================================

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

    await pool.query(`
        ALTER TABLE contact_messages
        ADD COLUMN IF NOT EXISTS landing_page TEXT,
        ADD COLUMN IF NOT EXISTS source TEXT,
        ADD COLUMN IF NOT EXISTS medium TEXT,
        ADD COLUMN IF NOT EXISTS campaign TEXT,
        ADD COLUMN IF NOT EXISTS country TEXT,
        ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new';
    `);
}

// ============================================================
// PRODUCT SEED
// ============================================================

async function seedProductsIfEmpty() {
    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM products"
    );

    if (
        rows &&
        rows[0] &&
        rows[0].count === 0
    ) {
        const sample = [
            {
                id: 1,
                name: "ASPADOL 100mg",
                price: 249,
                img: "images/aspadol-100.webp",
            },
            {
                id: 2,
                name: "Tramadol Pink 100mg",
                price: 249,
                img: "images/trakem-100-mg-tramadol-tablet--218.jpg",
            },
        ];

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const stmt = `
                INSERT INTO products
                (id, name, price, img)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO NOTHING
            `;

            for (const p of sample) {
                await client.query(stmt, [
                    p.id,
                    p.name,
                    p.price,
                    p.img,
                ]);
            }

            await client.query("COMMIT");

            console.log(
                "Seeded sample products"
            );
        } catch (err) {
            await client.query("ROLLBACK");

            console.error(
                "Seeding error:",
                err.message
            );
        } finally {
            client.release();
        }
    }
}

// ============================================================
// PRODUCTS API
// ============================================================

app.get(
    "/api/products",
    async (req, res) => {
        try {
            const { rows } =
                await pool.query(
                    "SELECT * FROM products ORDER BY id"
                );

            res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
            res.json(rows);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: "Unable to fetch products",
            });
        }
    }
);

// ============================================================
// SOCIAL CLICKS
// ============================================================

app.post(
    "/api/social-clicks",
    async (req, res) => {
        const {
            platform,
            fullDate,
            page,
            device,
            browser,
        } = req.body;

        const safePlatform = cleanText(platform, 40);
        if (!safePlatform) {
            return res.status(400).json({ error: "Platform is required." });
        }

        try {
            const result =
                await pool.query(
                    `
                    INSERT INTO social_clicks
                    (
                        platform,
                        fullDate,
                        date,
                        page,
                        device,
                        browser
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                    `,
                    [
                        safePlatform,
                        cleanText(fullDate, 64) || new Date().toISOString(),
                        new Date().toLocaleString(),
                        cleanText(page, 300),
                        cleanText(device, 80),
                        cleanText(browser, 500),
                    ]
                );

            res.json({
                id: result.rows[0].id,
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to save social click",
            });
        }
    }
);

app.get(
    "/api/social-clicks",
    requireAdmin,
    async (req, res) => {
        try {
            const { rows } =
                await pool.query(
                    `
                    SELECT *
                    FROM social_clicks
                    ORDER BY id DESC
                    LIMIT 200
                    `
                );

            res.json(rows);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to fetch social clicks",
            });
        }
    }
);

app.delete(
    "/api/social-clicks",
    requireAdmin,
    async (req, res) => {
        try {
            await pool.query(
                "DELETE FROM social_clicks"
            );

            res.json({
                success: true,
                message:
                    "All social clicks deleted",
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: err.message,
            });
        }
    }
);

// ============================================================
// ORDERS API
// ============================================================

app.post(
    "/api/orders",
    async (req, res) => {
        const orderValidationError = validateOrderPayload(req.body);
        if (orderValidationError) {
            return res.status(400).json({ success: false, error: orderValidationError });
        }

        const orderId = crypto.randomUUID();
        const billingData = normalizeBilling(req.body.billing);
        const normalizedItems = normalizeOrderItems(req.body.items);
        const subtotal = roundMoney(
            normalizedItems.reduce((sum, item) => sum + item.linePrice, 0)
        );
        const shipping = roundMoney(ORDER_SHIPPING_FLAT);
        const tax = roundMoney(subtotal * ORDER_TAX_RATE);
        const total = roundMoney(subtotal + shipping + tax);
        const orderDate = new Date().toISOString();

        const client = await pool.connect();
        try {
            // The order header and line items are committed atomically. This avoids
            // orphaned/partial orders when one insert fails.
            await client.query("BEGIN");

            await client.query(
                `
                INSERT INTO orders
                (
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
                `,
                [
                    orderId,
                    billingData,
                    normalizedItems.length,
                    subtotal,
                    shipping,
                    tax,
                    total,
                    orderDate,
                ]
            );

            const itemStatement = `
                INSERT INTO order_items
                (
                    order_id,
                    name,
                    pillQty,
                    linePrice
                )
                VALUES ($1, $2, $3, $4)
            `;

            for (const item of normalizedItems) {
                await client.query(itemStatement, [
                    orderId,
                    item.name,
                    item.pillQty,
                    item.linePrice,
                ]);
            }

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("ORDER DATABASE ERROR:", error);
            return res.status(500).json({
                success: false,
                error: "Unable to save order",
                detail:
                    process.env.NODE_ENV === "production"
                        ? "A server error occurred while processing the order."
                        : error.message,
            });
        } finally {
            client.release();
        }

        const html = `
            <h2>New Order Request Received</h2>

            <h3>Customer Details</h3>

            <table border="1" cellpadding="8" style="border-collapse:collapse;">
                <tr><td>Name</td><td>${escapeHtml(billingData.firstName)} ${escapeHtml(billingData.lastName)}</td></tr>
                <tr><td>Email</td><td>${escapeHtml(billingData.email)}</td></tr>
                <tr><td>Phone</td><td>${escapeHtml(billingData.phone)}</td></tr>
                <tr><td>Street</td><td>${escapeHtml(billingData.street)}</td></tr>
                <tr><td>City</td><td>${escapeHtml(billingData.city)}</td></tr>
                <tr><td>State</td><td>${escapeHtml(billingData.state)}</td></tr>
                <tr><td>Zip</td><td>${escapeHtml(billingData.zip)}</td></tr>
                <tr><td>Country</td><td>${escapeHtml(billingData.country)}</td></tr>
            </table>

            <br>
            <h3>Items</h3>

            <table border="1" cellpadding="8" style="border-collapse:collapse;">
                <tr><th>Name</th><th>Pills</th><th>Price</th></tr>
                ${normalizedItems.map((item) => `
                    <tr>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${escapeHtml(item.pillQty)}</td>
                        <td>$${escapeHtml(item.linePrice.toFixed(2))}</td>
                    </tr>
                `).join("")}
            </table>

            <h3>Totals</h3>
            <p>
                Subtotal : $${escapeHtml(subtotal.toFixed(2))}<br>
                Shipping : $${escapeHtml(shipping.toFixed(2))}<br>
                Tax : $${escapeHtml(tax.toFixed(2))}<br>
                Grand Total : $${escapeHtml(total.toFixed(2))}
            </p>

            <p>Notes : ${escapeHtml(billingData.notes) || "None"}</p>
        `;

        // The database commit is the source of truth. Email failures are logged
        // but intentionally do not turn a successfully saved request into HTTP 500.
        try {
            if (transporter && SMTP_USER && EMAIL_TO) {
                await transporter.sendMail({
                    from: SMTP_USER,
                    to: EMAIL_TO,
                    subject: `New Order Request ${orderId}`,
                    html,
                });
                console.log(`Admin order email sent successfully for order ${orderId}`);
            } else {
                console.warn(`Admin order email skipped for order ${orderId}: SMTP is not configured.`);
            }
        } catch (emailError) {
            console.error(`Admin order email failed for order ${orderId}:`, emailError.message);
        }

        try {
            if (transporter && SMTP_USER && billingData.email) {
                await transporter.sendMail({
                    from: SMTP_USER,
                    to: billingData.email,
                    subject: "Order Request Received - Pharmacies Doctor",
                    html: `
                        <h2>Order Request Received</h2>
                        <p>We received your order request.</p>
                        <p>Submitting a request does not guarantee dispensing or shipment. Any medication that requires a valid prescription must be verified before fulfillment.</p>
                        <p>Our team will contact you with the next applicable steps.</p>
                        <p><b>Request ID:</b> ${escapeHtml(orderId)}</p>
                    `,
                });
                console.log(`Customer confirmation email sent successfully for order ${orderId}`);
            } else {
                console.warn(`Customer confirmation email skipped for order ${orderId}: SMTP or customer email is missing.`);
            }
        } catch (emailError) {
            console.error(`Customer confirmation email failed for order ${orderId}:`, emailError.message);
        }

        return res.status(201).json({
            success: true,
            id: orderId,
            message: "Order request received.",
            totals: { subtotal, shipping, tax, total },
        });
    }
);

// ============================================================
// GET ORDERS
// ============================================================

app.get(
    "/api/orders",
    requireAdmin,
    async (req, res) => {
        try {
            const { rows } =
                await pool.query(
                    `
                    SELECT *
                    FROM orders
                    ORDER BY date DESC
                    LIMIT 100
                    `
                );

            if (!rows.length) {
                return res.json([]);
            }

            const orderIds =
                rows.map(
                    (r) => r.id
                );

            const itemsRes =
                await pool.query(
                    `
                    SELECT *
                    FROM order_items
                    WHERE order_id =
                        ANY($1::text[])
                    ORDER BY id ASC
                    `,
                    [orderIds]
                );

            const itemsByOrder =
                itemsRes.rows.reduce(
                    (acc, it) => {
                        acc[it.order_id] =
                            acc[it.order_id] ||
                            [];

                        acc[it.order_id].push(
                            it
                        );

                        return acc;
                    },
                    {}
                );

            const orders =
                rows.map((r) => ({
                    ...r,

                    items:
                        itemsByOrder[
                            r.id
                        ] || [],

                    billing:
                        r.billing,
                }));

            res.json(orders);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to fetch orders",
            });
        }
    }
);

// ============================================================
// DELETE ORDERS
// ============================================================

app.delete(
    "/api/orders",
    requireAdmin,
    async (req, res) => {
        try {
            await pool.query(
                "DELETE FROM order_items"
            );

            await pool.query(
                "DELETE FROM orders"
            );

            res.json({
                success: true,
                message:
                    "All orders deleted",
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: err.message,
            });
        }
    }
);

// ============================================================
// PUBLIC BLOG API
// ============================================================

// The public blog list is cached briefly so repeat visits do not wait for a
// fresh database request before the browser can render cached image URLs.

// ============================================================
// SINGLE BLOG API
// ============================================================

app.get(
    "/api/blogs",
    async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT
                    id,
                    title,
                    slug,
                    excerpt,
                    featured_image,
                    category,
                    author,
                    created_at,
                    updated_at
                FROM blogs
                WHERE is_published = true
                ORDER BY created_at DESC
            `);

            res.set({
                "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
            });

            res.json(rows);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: "Unable to fetch blogs"
            });
        }
    }
);

app.get(
    "/api/blogs/:slug",
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, title, slug, excerpt, content, featured_image, category, author, tags, created_at, updated_at
                 FROM blogs
                 WHERE slug = $1 AND is_published = true
                 LIMIT 1`,
                [req.params.slug]
            );

            if (!rows.length) {
                return res.status(404).json({ error: "Blog post not found" });
            }

            res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
            res.json({ ...rows[0], content: sanitizeBlogHtml(rows[0].content) });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Unable to fetch blog post" });
        }
    }
);

// ============================================================
// ADMIN BLOGS
// ============================================================

app.get(
    "/api/admin/blogs",
    requireAdmin,
    async (req, res) => {
        try {
            const { rows } =
                await pool.query(
                    `
                    SELECT *
                    FROM blogs
                    ORDER BY created_at DESC
                    `
                );

            res.json(rows);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to fetch all blogs",
            });
        }
    }
);

// ============================================================
// CREATE BLOG
// ============================================================

app.post(
    "/api/blogs",
    requireAdmin,
    async (req, res) => {
        const {
            title,
            slug,
            excerpt,
            content,
            featured_image,
            category,
            author,
            tags,
            is_published,
        } = req.body;

        try {
            const query = `
                INSERT INTO blogs
                (
                    title,
                    slug,
                    excerpt,
                    content,
                    featured_image,
                    category,
                    author,
                    tags,
                    is_published
                )
                VALUES
                ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9)
                RETURNING *
            `;

            const values = [
                title,
                slug,
                excerpt || "",
                sanitizeBlogHtml(content),
                featured_image || "",
                category || "",
                author || "Pharmacies Doctor",
                tags || "",
                is_published !== undefined
                    ? is_published
                    : true,
            ];

            const { rows } =
                await pool.query(
                    query,
                    values
                );

            res.status(201).json({
                success: true,
                message:
                    "Blog post created successfully!",
                data: rows[0],
            });
        } catch (err) {
            console.error(err);

            if (
                err.code === "23505"
            ) {
                return res.status(400).json({
                    error:
                        "A blog post with this URL slug already exists.",
                });
            }

            res.status(500).json({
                error:
                    "Unable to create blog post on the server.",
            });
        }
    }
);

// ============================================================
// UPDATE BLOG
// ============================================================

app.put(
    "/api/blogs/:id",
    requireAdmin,
    async (req, res) => {
        const { id } =
            req.params;

        const {
            title,
            slug,
            excerpt,
            content,
            featured_image,
            category,
            author,
            tags,
            is_published,
        } = req.body;

        try {
            const query = `
                UPDATE blogs
                SET
                    title = $1,
                    slug = $2,
                    excerpt = $3,
                    content = $4,
                    featured_image = $5,
                    category = $6,
                    author = $7,
                    tags = $8,
                    is_published = $9,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $10
                RETURNING *
            `;

            const values = [
                title,
                slug,
                excerpt,
                sanitizeBlogHtml(content),
                featured_image,
                category,
                author,
                tags,
                is_published,
                id,
            ];

            const { rows } =
                await pool.query(
                    query,
                    values
                );

            if (!rows.length) {
                return res.status(404).json({
                    error:
                        "Blog post not found",
                });
            }

            res.json({
                success: true,
                message:
                    "Blog updated successfully",
                data: rows[0],
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to update blog post",
            });
        }
    }
);

// ============================================================
// DELETE BLOG
// ============================================================

app.delete(
    "/api/blogs/:id",
    requireAdmin,
    async (req, res) => {
        const { id } =
            req.params;

        try {
            const { rowCount } =
                await pool.query(
                    "DELETE FROM blogs WHERE id = $1",
                    [id]
                );

            if (rowCount === 0) {
                return res.status(404).json({
                    error:
                        "Blog post not found",
                });
            }

            res.json({
                success: true,
                message:
                    "Blog deleted successfully",
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Unable to delete blog post",
            });
        }
    }
);

// ============================================================
// CONTACT API
// ============================================================

app.post(
    "/api/contact",
    async (req, res) => {
        const {
            first_name,
            last_name,
            email,
            phone,
            subject,
            message,
            landing_page,
            source,
            medium,
            campaign,
            country,
        } = req.body;

        if (
            !first_name ||
            !last_name ||
            !email ||
            !message
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Please fill in all required fields.",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, error: "Please enter a valid email address." });
        }

        const contactLimits = {
            first_name: [first_name, 80], last_name: [last_name, 80], email: [email, 254],
            phone: [phone, 40], subject: [subject, 200], message: [message, 10000],
            landing_page: [landing_page, 500], source: [source, 120], medium: [medium, 120],
            campaign: [campaign, 200], country: [country, 120],
        };
        for (const [field, [value, max]] of Object.entries(contactLimits)) {
            if (String(value ?? "").length > max) {
                return res.status(400).json({ success: false, error: `${field} is too long.` });
            }
        }

        try {
            // ----------------------------------------------------
            // SAVE CONTACT MESSAGE
            // ----------------------------------------------------

            await pool.query(
                `
                INSERT INTO contact_messages
                (
                    first_name,
                    last_name,
                    email,
                    phone,
                    subject,
                    message,
                    ip_address,
                    landing_page,
                    source,
                    medium,
                    campaign,
                    country
                )
                VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `,
                [
                    first_name,
                    last_name,
                    email,
                    phone || "",
                    subject || "",
                    message,
                    req.ip,
                    landing_page || "",
                    source || "",
                    medium || "",
                    campaign || "",
                    country || "",
                ]
            );

            // ----------------------------------------------------
            // EMAIL TO ADMIN
            //
            // Email failure must NOT make the saved
            // contact message fail.
            // ----------------------------------------------------

            try {
                if (
                    transporter &&
                    SMTP_USER &&
                    EMAIL_TO
                ) {
                    await transporter.sendMail({
                        from: SMTP_USER,
                        to: EMAIL_TO,

                        subject:
                            `New Contact Form: ${
                                escapeHtml(
                                    subject
                                ) ||
                                "General Inquiry"
                            }`,

                        html: `
                            <h2>
                                New Contact Message
                            </h2>

                            <p>
                                <b>Name:</b>
                                ${escapeHtml(
                                    first_name
                                )}
                                ${escapeHtml(
                                    last_name
                                )}
                            </p>

                            <p>
                                <b>Email:</b>
                                ${escapeHtml(
                                    email
                                )}
                            </p>

                            <p>
                                <b>Phone:</b>
                                ${
                                    escapeHtml(
                                        phone
                                    ) ||
                                    "Not provided"
                                }
                            </p>

                            <p>
                                <b>Subject:</b>
                                ${escapeHtml(
                                    subject
                                )}
                            </p>

                            <p>
                                <b>Message:</b>
                            </p>

                            <blockquote
                                style="
                                    background:#f4f4f4;
                                    padding:10px;
                                "
                            >
                                ${escapeHtml(
                                    message
                                ).replace(
                                    /\n/g,
                                    "<br>"
                                )}
                            </blockquote>
                        `,
                    });

                    console.log(
                        "Contact email sent successfully."
                    );
                } else {
                    console.warn(
                        "Contact email skipped: SMTP is not configured."
                    );
                }
            } catch (emailError) {
                console.error(
                    "Contact email failed:",
                    emailError.message
                );

                // Do NOT throw.
                // Contact message is already saved.
            }

            return res.json({
                success: true,
                message:
                    "Your message has been sent successfully!",
            });
        } catch (err) {
            console.error(
                "Contact API Error:",
                err
            );

            return res.status(500).json({
                success: false,
                error:
                    "Server error handling contact submission.",
            });
        }
    }
);

// ============================================================
// GET CONTACT MESSAGES
// ============================================================

app.get(
    "/api/contact",
    requireAdmin,
    async (req, res) => {
        try {
            const { rows } =
                await pool.query(
                    `
                    SELECT *
                    FROM contact_messages
                    ORDER BY created_at DESC
                    `
                );

            res.json(rows);
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: err.message,
            });
        }
    }
);

// ============================================================
// CONTACT STATS
// ============================================================

app.get(
    "/api/contact/stats",
    requireAdmin,
    async (req, res) => {
        try {
            const total =
                await pool.query(
                    `
                    SELECT COUNT(*) total
                    FROM contact_messages
                    `
                );

            const today =
                await pool.query(
                    `
                    SELECT COUNT(*) today
                    FROM contact_messages
                    WHERE DATE(created_at) =
                        CURRENT_DATE
                    `
                );

            res.json({
                total: Number(
                    total.rows[0].total
                ),

                today: Number(
                    today.rows[0].today
                ),
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error: err.message,
            });
        }
    }
);

// ============================================================
// DELETE CONTACT MESSAGES
// ============================================================

app.delete(
    "/api/contact",
    requireAdmin,
    async (req, res) => {
        try {
            await pool.query(
                "TRUNCATE TABLE contact_messages RESTART IDENTITY"
            );

            res.json({
                success: true,
                message:
                    "Deleted successfully",
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message,
            });
        }
    }
);

// ============================================================
// IMAGE UPLOAD
// ============================================================

app.post(
    "/api/upload-base64",
    requireAdmin,
    (req, res) => {
        const { image } =
            req.body;

        if (!image) {
            return res.status(400).json({
                error:
                    "No image data provided",
            });
        }

        try {
            const imagesDir = UPLOAD_DIR;

            if (
                !fs.existsSync(
                    imagesDir
                )
            ) {
                fs.mkdirSync(
                    imagesDir,
                    {
                        recursive: true,
                    }
                );
            }

            const matches =
                image.match(
                    /^data:([A-Za-z-+\/]+);base64,(.+)$/
                );

            if (
                !matches ||
                matches.length !== 3
            ) {
                return res.status(400).json({
                    error:
                        "Invalid image data",
                });
            }

            const mime = String(matches[1] || "").toLowerCase();
            const allowedImageTypes = new Map([
                ["image/jpeg", "jpg"],
                ["image/png", "png"],
                ["image/webp", "webp"],
                ["image/avif", "avif"],
            ]);
            const ext = allowedImageTypes.get(mime);
            if (!ext) {
                return res.status(415).json({ error: "Only JPEG, PNG, WebP and AVIF images are allowed." });
            }

            const base64Data =
                matches[2];

            const buffer =
                Buffer.from(
                    base64Data,
                    "base64"
                );

            if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
                return res.status(413).json({ error: "Image must be between 1 byte and 5 MB." });
            }

            const fileName =
                `${Date.now()}-${Math.round(
                    Math.random() * 1e9
                )}.${ext}`;

            const filePath =
                path.join(
                    imagesDir,
                    fileName
                );

            fs.writeFileSync(
                filePath,
                buffer
            );

            res.json({
                success: true,
                imageUrl:
                    `images/${fileName}`,
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                error:
                    "Failed to write file to disk",
            });
        }
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "pharmacies-doctor-api",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

app.get("/health/ready", async (req, res) => {
    if (!databaseReady) {
        return res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
    try {
        await pool.query("SELECT 1");
        return res.status(200).json({ status: "ready", database: "ok" });
    } catch (error) {
        console.error("Readiness check failed:", error.message);
        return res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
});

// ============================================================
// BLOG TEMPLATE FETCHER
// ============================================================

async function getBlogPostTemplate() {
    // Prefer the local template. This avoids a self-HTTP request on every
    // blog page and keeps SSR independent of DNS/TLS/network availability.
    const localCandidates = [
        path.join(__dirname, "blog-post.html"),
        path.join(__dirname, "../public_html/blog-post.html"),
    ];

    for (const candidate of localCandidates) {
        if (fs.existsSync(candidate)) {
            const html = await fs.promises.readFile(candidate, "utf8");
            if (html.length >= 100) return html;
        }
    }

    // Compatibility fallback for deployments where the template is hosted
    // only on the frontend. This path is no longer used in the normal layout.
    if (typeof fetch !== "function") {
        throw new Error("Global fetch is unavailable. Node.js 18+ is required.");
    }

    const response = await fetch(BLOG_TEMPLATE_URL, {
        cache: "no-store",
        headers: {
            "User-Agent": "PharmaciesDoctor-Blog-SSR/2.0",
            Accept: "text/html",
        },
    });

    if (!response.ok) {
        throw new Error(`Unable to fetch blog-post.html: HTTP ${response.status}`);
    }

    const html = await response.text();
    if (!html || html.length < 100) {
        throw new Error("blog-post.html was fetched but appears to be empty.");
    }
    return html;
}

// ============================================================
// RAW BLOG TEMPLATE REDIRECT
// ============================================================

app.get("/blog-post.html", (req, res) => {
    let blogTemplatePath = path.join(
        __dirname,
        "blog-post.html"
    );

    // Fallback if template is inside public_html
    if (!fs.existsSync(blogTemplatePath)) {
        blogTemplatePath = path.join(
            __dirname,
            "../public_html/blog-post.html"
        );
    }

    if (!fs.existsSync(blogTemplatePath)) {
        console.error(
            "BLOG TEMPLATE NOT FOUND:",
            blogTemplatePath
        );

        return res.status(404).send(
            "blog-post.html not found."
        );
    }

    console.log(
        "Serving raw blog template:",
        blogTemplatePath
    );

    res.sendFile(blogTemplatePath);
});

// ============================================================
// BLOG MAIN PAGE
// ============================================================

app.get(
    "/blog",
    (req, res) => {
        let blogHtmlPath =
            path.join(
                __dirname,
                "blog.html"
            );

        if (
            !fs.existsSync(
                blogHtmlPath
            )
        ) {
            blogHtmlPath =
                path.join(
                    __dirname,
                    "../public_html/blog.html"
                );
        }

        if (
            !fs.existsSync(
                blogHtmlPath
            )
        ) {
            return res
                .status(404)
                .send(
                    "Blog page not found."
                );
        }

        res.sendFile(
            blogHtmlPath
        );
    }
);

// ============================================================
// BLOG POST SSR
// ============================================================

app.get(
    "/blog/:slug",
    async (req, res) => {
        console.log(
            "================================="
        );

        console.log(
            "BLOG SSR ROUTE HIT"
        );

        console.log(
            "Host:",
            req.headers.host
        );

        console.log(
            "Slug:",
            req.params.slug
        );

        console.log(
            "================================="
        );

        try {
            const slug =
                req.params.slug;

            // ------------------------------------------------
            // GET BLOG FROM DATABASE
            // ------------------------------------------------

            const { rows } =
                await pool.query(
                    `
                    SELECT *
                    FROM blogs
                    WHERE slug = $1
                      AND is_published = true
                    LIMIT 1
                    `,
                    [slug]
                );

            console.log(
                "Database result:",
                rows.length
            );

            if (!rows.length) {
                return res
                    .status(404)
                    .send(
                        "Blog post not found"
                    );
            }

            const blog = {
                ...rows[0],
                content: sanitizeBlogHtml(rows[0].content),
            };

            console.log(
                "BLOG FOUND:",
                blog.title
            );

            // ------------------------------------------------
            // GET TEMPLATE FROM FRONTEND
            // ------------------------------------------------

            let html;

            try {
                html =
                    await getBlogPostTemplate();
            } catch (
                templateError
            ) {
                console.error(
                    "BLOG TEMPLATE FETCH ERROR:",
                    templateError
                );

                return res
                    .status(500)
                    .send(
                        "Unable to load blog post template."
                    );
            }

            // ------------------------------------------------
            // MAIN DOMAIN
            // ------------------------------------------------

            const siteUrl =
                SITE_URL;

            const imageBase =
                SITE_URL;

            // ------------------------------------------------
            // FEATURED IMAGE
            // ------------------------------------------------

            let image =
                `${SITE_URL}/images/og-image.jpg`;

            if (
                blog.featured_image
            ) {
                const youtubeId =
                    getYouTubeId(
                        blog.featured_image
                    );

                if (youtubeId) {
                    image =
                        `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
                } else if (
                    typeof blog.featured_image ===
                        "string" &&
                    blog.featured_image.startsWith(
                        "http"
                    )
                ) {
                    image =
                        blog.featured_image;
                } else {
                    image =
                        `${BACKEND_URL}/${String(
                            blog.featured_image
                        ).replace(
                            /^\/+/,
                            ""
                        )}`;
                }
            }

            // ------------------------------------------------
            // SEO TITLE
            // ------------------------------------------------

            const safeTitle =
                escapeHtmlAttribute(
                    blog.title ||
                        "Pharmacies Doctor Blog"
                );

            // ------------------------------------------------
            // SEO DESCRIPTION
            // ------------------------------------------------

            const descriptionSource =
                blog.excerpt ||
                blog.description ||
                blog.content ||
                "";

            const safeDescription =
                escapeHtmlAttribute(
                    stripHtml(
                        descriptionSource
                    )
                        .substring(
                            0,
                            160
                        )
                        .trim()
                );

            // ------------------------------------------------
            // CANONICAL URL
            // ------------------------------------------------

            const canonicalUrl =
                `${siteUrl}/blog/${encodeURIComponent(
                    blog.slug
                )}`;

            console.log(
                "Canonical:",
                canonicalUrl
            );

            console.log(
                "OG Image:",
                image
            );

            // ------------------------------------------------
            // REPLACE TEMPLATE VARIABLES
            // ------------------------------------------------

            html =
                html.replace(
                    /{{BLOG_TITLE}}/g,
                    safeTitle
                );

            html =
                html.replace(
                    /{{BLOG_DESCRIPTION}}/g,
                    safeDescription
                );

            html =
                html.replace(
                    /{{BLOG_URL}}/g,
                    canonicalUrl
                );

            html =
                html.replace(
                    /{{BLOG_IMAGE}}/g,
                    image
                );

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            res.status(200);

            res.setHeader(
                "Content-Type",
                "text/html; charset=utf-8"
            );

            res.setHeader(
                "Cache-Control",
                "public, max-age=60, stale-while-revalidate=300"
            );

            res.send(html);
        } catch (err) {
            console.error(
                "================================="
            );

            console.error(
                "BLOG SSR ERROR:"
            );

            console.error(err);

            console.error(
                "================================="
            );

            res.status(500).send(
                "Server Error serving blog post."
            );
        }
    }
);

// ============================================================
// ROOT
// ============================================================

app.get(
    "/",
    (req, res) => {
        let indexHtmlPath =
            path.join(
                __dirname,
                "index.html"
            );

        if (
            !fs.existsSync(
                indexHtmlPath
            )
        ) {
            indexHtmlPath =
                path.join(
                    __dirname,
                    "../public_html/index.html"
                );
        }

        if (
            !fs.existsSync(
                indexHtmlPath
            )
        ) {
            return res
                .status(404)
                .send(
                    "Frontend index.html not found."
                );
        }

        res.sendFile(
            indexHtmlPath
        );
    }
);

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            error: "Route not found",
            requestId: req.requestId,
        });
    }
    return res.status(404).type("text/plain").send("Not found");
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {
        console.error(
            "Unhandled Express Error:",
            { code: err.code || err.type || "INTERNAL_ERROR", requestId: req.requestId }
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        if (err.code === "ORIGIN_NOT_ALLOWED") {
            return res.status(403).json({ code: err.code, error: "This website origin is not allowed by the API." });
        }
        if (err.type === "entity.parse.failed") {
            return res.status(400).json({ code: "INVALID_JSON", error: "The request body must be valid JSON." });
        }

        res.status(500).json({
            error:
                "Internal server error",
        });
    }
);

// ============================================================
// START SERVER
// ============================================================

// ============================================================
// START SERVER
// ============================================================

async function initializeDatabase() {
    if (databaseInitializing || databaseReady || shuttingDown) return;

    databaseInitializing = true;

    try {
        await createTables();
        await seedProductsIfEmpty();

        databaseReady = true;

        console.log("Database initialized; API data routes are ready.");
    } catch (error) {
        databaseReady = false;

        console.error(
            "Database initialization failed. Check DATABASE_URL, database permissions and connectivity.",
            error.code || "DATABASE_ERROR"
        );

        if (!shuttingDown) {
            databaseRetryTimer = setTimeout(initializeDatabase, 10000);
            databaseRetryTimer.unref();
        }
    } finally {
        databaseInitializing = false;
    }
}

function startServer() {
    const server = app.listen(PORT, HOST, () => {
        console.log(
            `Pharmacies Doctor API listening on ${HOST}:${server.address().port}`
        );

        console.log(
            "GET /health checks the process; GET /health/ready checks the database."
        );

        initializeDatabase();
    });

    server.on("error", error => {
        console.error(
            "HTTP server failed to start:",
            error.code || "LISTEN_ERROR"
        );

        process.exitCode = 1;
    });

    const shutdown = signal => {
        if (shuttingDown) return;

        shuttingDown = true;

        console.log(
            `${signal} received. Shutting down gracefully...`
        );

        clearTimeout(databaseRetryTimer);

        server.close(async () => {
            try {
                await pool.end();
            } finally {
                process.exit(0);
            }
        });

        setTimeout(() => process.exit(1), 15000).unref();
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));

    return server;
}

// Hostinger Node.js hosting requires the application to listen
// immediately when the entry file is loaded.
startServer();

module.exports = {
    app,
    startServer,
    pool
};
