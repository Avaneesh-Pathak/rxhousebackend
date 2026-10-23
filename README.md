# Pharmacies Doctor Backend

Express/PostgreSQL API for `pharmacies.doctor`.

## Requirements

- Node.js 22+
- PostgreSQL
- SMTP credentials if email notifications are required

For deployment and the HTTP 503/CORS login issue, follow [LOGIN-SETUP.md](LOGIN-SETUP.md).

## Local setup

```bash
cp .env.example .env
npm ci
npm run check
npm start
```

Set at least `DATABASE_URL`. For the admin dashboards, also set a strong `ADMIN_PASSWORD` and a separate random `ADMIN_TOKEN_SECRET`.

## Security model

- Admin data routes require a short-lived bearer token from `POST /api/admin/login`.
- The admin password and signing secret exist only on the server; never put them in frontend JavaScript.
- Admin login is rate limited.
- Public mutation endpoints have a lightweight server-side rate limiter; production should also use host/WAF rate limiting.
- Order item IDs/names are validated against `catalog-pricing.js` and prices/totals are recalculated server-side.
- Order headers and order items are committed in one PostgreSQL transaction.
- Blog HTML is sanitized on write/read.
- Base64 uploads are restricted to JPEG, PNG, WebP and AVIF with a 5 MB decoded limit.

## Important environment variables

See `.env.example`. Key values include:

```dotenv
DATABASE_URL=
SITE_URL=https://pharmacies.doctor
BACKEND_URL=https://pd.pharmacies.doctor
CORS_ORIGINS=https://pharmacies.doctor,https://www.pharmacies.doctor

ADMIN_PASSWORD=
ADMIN_TOKEN_SECRET=
ADMIN_TOKEN_TTL_SECONDS=28800

ORDER_TAX_RATE=0.0825
ORDER_SHIPPING_FLAT=9.99
ORDER_FREE_SHIPPING_THRESHOLD=150

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_TO=
```

`ORDER_TAX_RATE`, `ORDER_SHIPPING_FLAT` and `ORDER_FREE_SHIPPING_THRESHOLD` are server-authoritative and sent to the frontend by `GET /api/orders/config`. The default is 8.25% tax and $9.99 shipping, waived at $150. Configure taxes and shipping for the jurisdictions where you operate. Keep `catalog-pricing.js` synchronized with the public catalog.

**Email:** Set `SMTP_USER` and `SMTP_PASS` (for Gmail, a Google App Password with 2-Step Verification). Set `EMAIL_TO` to your monitored order inbox; if blank it defaults to `SMTP_USER`. Every successfully saved order generates an email to the order inbox with the reference, timestamp, all billing/delivery fields, requested products, quantities and totals, plus a customer acknowledgment email. Email errors are logged; a request is **not** lost from PostgreSQL if SMTP fails. Email delivery depends on the SMTP provider and cannot be guaranteed by the application. Prescription-required products must be verified by an authorized pharmacy professional before any fulfillment.

## Main endpoints

Public:

- `GET /health`
- `GET /health/ready`
- `GET /api/products`
- `GET /api/orders/config` (tax/shipping rates for checkout)
- `POST /api/orders` (validated order request; returns database UUID)
- `POST /api/contact`
- `POST /api/social-clicks`
- `GET /api/blogs`
- `GET /api/blogs/:slug`

Admin-authenticated:

- `POST /api/admin/login` (login endpoint itself is public but rate-limited)
- `GET /api/admin/session` (validates the token without database access)
- `GET /api/orders`
- `DELETE /api/orders`
- `GET /api/contact`
- `GET /api/contact/stats`
- `DELETE /api/contact`
- `GET /api/social-clicks`
- `DELETE /api/social-clicks`
- `GET /api/admin/blogs`
- `POST /api/blogs`
- `PUT /api/blogs/:id`
- `DELETE /api/blogs/:id`
- `POST /api/upload-base64`

## Pre-deployment checks

```bash
npm ci
npm run check
```

Then verify database migrations/table creation against a staging PostgreSQL database and exercise admin login, order submission, contact submission, blog CRUD and email delivery before production deployment.
