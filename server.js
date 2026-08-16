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

// ============================================================
// CONFIGURATION
// ============================================================

const SITE_URL = "https://pharmacies.doctor";
const BLOG_TEMPLATE_URL =
    process.env.BLOG_TEMPLATE_URL ||
    `${SITE_URL}/blog-post.html`;

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/rxhouse";

// ============================================================
// CORS
// ============================================================

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

// ============================================================
// BODY PARSING
// ============================================================

app.use(
    express.json({
        limit: "10mb",
    })
);

// ============================================================
// REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );

    if (req.headers.origin) {
        console.log("Origin:", req.headers.origin);
    }

    next();
});

// ============================================================
// STATIC ASSETS
// ============================================================
//
// These are only useful if css/js/images also exist beside
// server.js. Your main frontend can continue serving its own
// assets independently.
//
// We keep these routes for backward compatibility.
//

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
    express.static(path.join(__dirname, "images"))
);

// ============================================================
// DATABASE
// ============================================================

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl:
        process.env.NODE_ENV === "production"
            ? {
                  rejectUnauthorized: false,
              }
            : false,
});

// ============================================================
// EMAIL
// ============================================================

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

    return match && match[2] && match[2].length === 11
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

            console.log("Seeded sample products");
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
// DEBUG ORDERS
// ============================================================

app.get("/debug/orders", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM orders"
        );

        res.json(result.rows);
    } catch (e) {
        res.status(500).json(e);
    }
});

// ============================================================
// PRODUCTS API
// ============================================================

app.get("/api/products", async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT * FROM products ORDER BY id"
        );

        res.json(rows);
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Unable to fetch products",
        });
    }
});

// ============================================================
// SOCIAL CLICKS
// ============================================================

app.post("/api/social-clicks", async (req, res) => {
    const {
        platform,
        fullDate,
        page,
        device,
        browser,
    } = req.body;

    try {
        const result = await pool.query(
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
                platform,
                fullDate ||
                    new Date().toISOString(),
                new Date().toLocaleString(),
                page || "",
                device || "",
                browser || "",
            ]
        );

        res.json({
            id: result.rows[0].id,
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Unable to save social click",
        });
    }
});

app.get("/api/social-clicks", async (req, res) => {
    try {
        const { rows } = await pool.query(
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
            error: "Unable to fetch social clicks",
        });
    }
});

app.delete("/api/social-clicks", async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM social_clicks"
        );

        res.json({
            success: true,
            message: "All social clicks deleted",
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message,
        });
    }
});

// ============================================================
// ORDERS API
// ============================================================

app.post("/api/orders", async (req, res) => {
    const {
        id,
        billing,
        items,
        itemCount,
        subtotal,
        shipping,
        tax,
        total,
        date,
    } = req.body;

    const orderId =
        id || Date.now().toString();

    try {
        await pool.query(
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
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
            `,
            [
                orderId,
                billing || {},
                itemCount,
                subtotal,
                shipping,
                tax,
                total,
                date ||
                    new Date().toISOString(),
            ]
        );

        if (
            Array.isArray(items) &&
            items.length
        ) {
            const client =
                await pool.connect();

            try {
                await client.query(
                    "BEGIN"
                );

                const stmt = `
                    INSERT INTO order_items
                    (
                        order_id,
                        name,
                        pillQty,
                        linePrice
                    )
                    VALUES ($1, $2, $3, $4)
                `;

                for (const it of items) {
                    await client.query(
                        stmt,
                        [
                            orderId,
                            it.name,
                            it.pillQty || 0,
                            it.linePrice || 0,
                        ]
                    );
                }

                await client.query(
                    "COMMIT"
                );
            } catch (err) {
                await client.query(
                    "ROLLBACK"
                );

                console.error(
                    "Order items error:",
                    err.message
                );
            } finally {
                client.release();
            }
        }

        const billingData =
            billing || {};

        const html = `
            <h2>New Order Received</h2>

            <h3>Customer Details</h3>

            <table
                border="1"
                cellpadding="8"
                style="border-collapse:collapse;"
            >
                <tr>
                    <td>Name</td>
                    <td>
                        ${escapeHtml(
                            billingData.firstName
                        )}
                        ${escapeHtml(
                            billingData.lastName
                        )}
                    </td>
                </tr>

                <tr>
                    <td>Email</td>
                    <td>
                        ${escapeHtml(
                            billingData.email
                        )}
                    </td>
                </tr>

                <tr>
                    <td>Phone</td>
                    <td>
                        ${escapeHtml(
                            billingData.phone
                        )}
                    </td>
                </tr>

                <tr>
                    <td>Street</td>
                    <td>
                        ${escapeHtml(
                            billingData.street
                        )}
                    </td>
                </tr>

                <tr>
                    <td>City</td>
                    <td>
                        ${escapeHtml(
                            billingData.city
                        )}
                    </td>
                </tr>

                <tr>
                    <td>State</td>
                    <td>
                        ${escapeHtml(
                            billingData.state
                        )}
                    </td>
                </tr>

                <tr>
                    <td>Zip</td>
                    <td>
                        ${escapeHtml(
                            billingData.zip
                        )}
                    </td>
                </tr>

                <tr>
                    <td>Country</td>
                    <td>
                        ${escapeHtml(
                            billingData.country
                        )}
                    </td>
                </tr>
            </table>

            <br>

            <h3>Items</h3>

            <table
                border="1"
                cellpadding="8"
                style="border-collapse:collapse;"
            >
                <tr>
                    <th>Name</th>
                    <th>Qty</th>
                    <th>Price</th>
                </tr>

                ${(items || [])
                    .map(
                        (i) => `
                            <tr>
                                <td>
                                    ${escapeHtml(
                                        i.name
                                    )}
                                </td>

                                <td>
                                    ${i.pillQty}
                                </td>

                                <td>
                                    $${i.linePrice}
                                </td>
                            </tr>
                        `
                    )
                    .join("")}
            </table>

            <h3>Totals</h3>

            <p>
                Subtotal : $${subtotal}<br>
                Tax : $${tax}<br>
                Grand Total : $${total}
            </p>

            <p>
                Notes :
                ${
                    escapeHtml(
                        billingData.notes
                    ) || "None"
                }
            </p>
        `;

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.EMAIL_TO,
            subject: `New Order ${orderId}`,
            html,
        });

        if (billingData.email) {
            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: billingData.email,
                subject:
                    "Order Confirmation - Pharmacies Doctor",

                html: `
                    <h2>
                        Thank You for Your Order
                    </h2>

                    <p>
                        Your order has been
                        received successfully.
                    </p>

                    <p>
                        One of our representatives
                        will contact you shortly.
                    </p>

                    <p>
                        <b>Order ID:</b>
                        ${orderId}
                    </p>
                `,
            });
        }

        res.json({
            id: orderId,
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Unable to save order",
            detail: err.message,
        });
    }
});

app.get("/api/orders", async (req, res) => {
    try {
        const { rows } = await pool.query(
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
            rows.map((r) => r.id);

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
                        acc[it.order_id] || [];

                    acc[it.order_id].push(it);

                    return acc;
                },
                {}
            );

        const orders =
            rows.map((r) => ({
                ...r,
                items:
                    itemsByOrder[r.id] || [],
                billing: r.billing,
            }));

        res.json(orders);
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Unable to fetch orders",
        });
    }
});

app.delete("/api/orders", async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM order_items"
        );

        await pool.query(
            "DELETE FROM orders"
        );

        res.json({
            success: true,
            message: "All orders deleted",
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message,
        });
    }
});

// ============================================================
// PUBLIC BLOG API
// ============================================================

app.get("/api/blogs", async (req, res) => {
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
                created_at
            FROM blogs
            WHERE is_published = true
            ORDER BY created_at DESC
        `);

        res.json(rows);
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Unable to fetch blogs",
        });
    }
});

// ============================================================
// SINGLE BLOG API
// ============================================================

app.get("/api/blogs/:slug", async (req, res) => {
    try {
        const { rows } =
            await pool.query(
                `
                SELECT *
                FROM blogs
                WHERE slug = $1
                `,
                [req.params.slug]
            );

        if (!rows.length) {
            return res.status(404).json({
                error: "Blog not found",
            });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Server Error",
        });
    }
});

// ============================================================
// ADMIN BLOGS
// ============================================================

app.get("/api/admin/blogs", async (req, res) => {
    try {
        const { rows } = await pool.query(
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
            error: "Unable to fetch all blogs",
        });
    }
});

// ============================================================
// CREATE BLOG
// ============================================================

app.post("/api/blogs", async (req, res) => {
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
            content,
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

        if (err.code === "23505") {
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
});

// ============================================================
// UPDATE BLOG
// ============================================================

app.put("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;

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
            content,
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
                error: "Blog post not found",
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
});

// ============================================================
// DELETE BLOG
// ============================================================

app.delete("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const { rowCount } =
            await pool.query(
                "DELETE FROM blogs WHERE id = $1",
                [id]
            );

        if (rowCount === 0) {
            return res.status(404).json({
                error: "Blog post not found",
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
});

// ============================================================
// CONTACT API
// ============================================================

app.post("/api/contact", async (req, res) => {
    const {
        first_name,
        last_name,
        email,
        phone,
        subject,
        message,
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

    try {
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
                ip_address
            )
            VALUES
            ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                first_name,
                last_name,
                email,
                phone || "",
                subject || "",
                message,
                req.ip,
            ]
        );

        // Email to admin
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.EMAIL_TO,

            subject:
                `New Contact Form: ${
                    escapeHtml(subject) ||
                    "General Inquiry"
                }`,

            html: `
                <h2>
                    New Contact Message
                </h2>

                <p>
                    <b>Name:</b>
                    ${escapeHtml(first_name)}
                    ${escapeHtml(last_name)}
                </p>

                <p>
                    <b>Email:</b>
                    ${escapeHtml(email)}
                </p>

                <p>
                    <b>Phone:</b>
                    ${
                        escapeHtml(phone) ||
                        "Not provided"
                    }
                </p>

                <p>
                    <b>Subject:</b>
                    ${escapeHtml(subject)}
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
                    ${escapeHtml(message)
                        .replace(
                            /\n/g,
                            "<br>"
                        )}
                </blockquote>
            `,
        });

        res.json({
            success: true,
            message:
                "Your message has been sent successfully!",
        });
    } catch (err) {
        console.error(
            "Contact API Error:",
            err
        );

        res.status(500).json({
            success: false,
            error:
                "Server error handling contact submission.",
        });
    }
});

app.get("/api/contact", async (req, res) => {
    try {
        const { rows } =
            await pool.query(`
                SELECT *
                FROM contact_messages
                ORDER BY created_at DESC
            `);

        res.json(rows);
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message,
        });
    }
});

app.get("/api/contact/stats", async (req, res) => {
    try {
        const total =
            await pool.query(`
                SELECT COUNT(*) total
                FROM contact_messages
            `);

        const today =
            await pool.query(`
                SELECT COUNT(*) today
                FROM contact_messages
                WHERE DATE(created_at) =
                    CURRENT_DATE
            `);

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
});

app.delete("/api/contact", async (req, res) => {
    try {
        await pool.query(
            "TRUNCATE TABLE contact_messages RESTART IDENTITY"
        );

        res.json({
            success: true,
            message: "Deleted successfully",
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

app.post(
    "/api/upload-base64",
    (req, res) => {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({
                error:
                    "No image data provided",
            });
        }

        try {
            const imagesDir =
                path.join(
                    __dirname,
                    "images"
                );

            if (!fs.existsSync(imagesDir)) {
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

            const ext =
                matches[1].split("/")[1];

            const base64Data =
                matches[2];

            const buffer =
                Buffer.from(
                    base64Data,
                    "base64"
                );

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
    res.json({
        status: "ok",
    });
});

// ============================================================
// BLOG TEMPLATE FETCHER
// ============================================================
//
// IMPORTANT:
//
// blog-post.html stays on the MAIN FRONTEND:
//
// https://pharmacies.doctor/blog-post.html
//
// It is NOT required inside the backend directory.
//
// The backend downloads the template and then injects:
//
// {{BLOG_TITLE}}
// {{BLOG_DESCRIPTION}}
// {{BLOG_URL}}
// {{BLOG_IMAGE}}
//
// ============================================================

async function getBlogPostTemplate() {
    console.log(
        "Fetching blog template from:",
        BLOG_TEMPLATE_URL
    );

    // Node.js 18+ provides global fetch.
    if (
        typeof fetch !==
        "function"
    ) {
        throw new Error(
            "Global fetch is unavailable. Node.js 18+ is required."
        );
    }

    const response =
        await fetch(
            BLOG_TEMPLATE_URL,
            {
                cache: "no-store",
                headers: {
                    "User-Agent":
                        "PharmaciesDoctor-Blog-SSR/1.0",
                    Accept:
                        "text/html",
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `Unable to fetch blog-post.html: HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    if (
        !html ||
        html.length < 100
    ) {
        throw new Error(
            "blog-post.html was fetched but appears to be empty."
        );
    }

    console.log(
        "Blog template fetched successfully:",
        html.length,
        "bytes"
    );

    return html;
}

// ============================================================
// RAW BLOG TEMPLATE REDIRECT
// ============================================================
//
// Old URLs such as:
//
// /blog-post.html?slug=my-post
//
// are redirected to:
//
// /blog/my-post
//
// ============================================================

app.get(
    "/blog-post.html",
    (req, res) => {
        const slug =
            req.query.slug;

        if (slug) {
            return res.redirect(
                301,
                `/blog/${encodeURIComponent(
                    slug
                )}`
            );
        }

        res.redirect("/blog");
    }
);

// ============================================================
// BLOG MAIN PAGE
// ============================================================
//
// This route is kept for compatibility.
//
// If blog.html exists beside server.js,
// it will be served.
//
// Otherwise it attempts the legacy
// public_html location.
//

app.get("/blog", (req, res) => {
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
        return res.status(404).send(
            "Blog page not found."
        );
    }

    res.sendFile(blogHtmlPath);
});

// ============================================================
// BLOG POST SSR
// ============================================================
//
// IMPORTANT:
//
// The URL should ultimately be:
//
// https://pharmacies.doctor/blog/:slug
//
// The Node backend retrieves the database record,
// downloads blog-post.html from the MAIN DOMAIN,
// injects SEO metadata,
// and returns the completed HTML.
//
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

            // ----------------------------------------
            // GET BLOG FROM DATABASE
            // ----------------------------------------

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
                return res.status(404).send(
                    "Blog post not found"
                );
            }

            const blog =
                rows[0];

            console.log(
                "BLOG FOUND:",
                blog.title
            );

            // ----------------------------------------
            // GET TEMPLATE FROM FRONTEND
            // ----------------------------------------

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

                return res.status(500).send(
                    "Unable to load blog post template."
                );
            }

            // ----------------------------------------
            // MAIN DOMAIN
            // ----------------------------------------

            const siteUrl =
                SITE_URL;

            const imageBase =
                SITE_URL;

            // ----------------------------------------
            // FEATURED IMAGE
            // ----------------------------------------

            let image =
                `${imageBase}/images/pdlogo.png`;

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
                    blog.featured_image
                        .startsWith(
                            "http"
                        )
                ) {

                    image =
                        blog.featured_image;

                } else {

                    image =
                        `${imageBase}/${String(
                            blog.featured_image
                        ).replace(
                            /^\/+/,
                            ""
                        )}`;
                }
            }

            // ----------------------------------------
            // SEO TITLE
            // ----------------------------------------

            const safeTitle =
                escapeHtmlAttribute(
                    blog.title ||
                        "Pharmacies Doctor Blog"
                );

            // ----------------------------------------
            // SEO DESCRIPTION
            // ----------------------------------------

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

            // ----------------------------------------
            // CANONICAL URL
            // ----------------------------------------

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

            // ----------------------------------------
            // REPLACE TEMPLATE VARIABLES
            // ----------------------------------------

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

            // ----------------------------------------
            // RESPONSE
            // ----------------------------------------

            res.status(200);

            res.setHeader(
                "Content-Type",
                "text/html; charset=utf-8"
            );

            res.setHeader(
                "Cache-Control",
                "no-cache, no-store, must-revalidate"
            );

            res.setHeader(
                "Pragma",
                "no-cache"
            );

            res.setHeader(
                "Expires",
                "0"
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
//
// Kept for compatibility with existing backend/frontend
// arrangements.
//

app.get("/", (req, res) => {

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
        return res.status(404).send(
            "Frontend index.html not found."
        );
    }

    res.sendFile(
        indexHtmlPath
    );
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
            err
        );

        if (res.headersSent) {
            return next(err);
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

(async function init() {

    try {

        console.log(
            "================================="
        );

        console.log(
            "Starting Pharmacies Doctor backend"
        );

        console.log(
            "Environment:",
            process.env.NODE_ENV ||
                "development"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "SITE URL:",
            SITE_URL
        );

        console.log(
            "BLOG TEMPLATE:",
            BLOG_TEMPLATE_URL
        );

        console.log(
            "================================="
        );

        await createTables();

        console.log(
            "Database tables ready"
        );

        await seedProductsIfEmpty();

        app.listen(
            PORT,
            () => {

                console.log(
                    "================================="
                );

                console.log(
                    `Backend running on port ${PORT}`
                );

                console.log(
                    `Blog template: ${BLOG_TEMPLATE_URL}`
                );

                console.log(
                    "================================="
                );
            }
        );

    } catch (err) {

        console.error(
            "Initialization failed:",
            err
        );

        process.exit(1);
    }
})();