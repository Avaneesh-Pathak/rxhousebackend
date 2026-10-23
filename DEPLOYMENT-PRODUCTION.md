# Pharmacies Doctor production deployment

Use Node.js 22 or newer. For the login 503/CORS issue and exact environment settings, see [LOGIN-SETUP.md](LOGIN-SETUP.md).

## Runtime layout

Keep application code and uploaded media separate:

```text
/home/USERNAME/pharmacies-doctor-api/
    server.js
    package.json
    package-lock.json

/home/USERNAME/pharmacies-doctor-data/
    images/
```

Set `UPLOAD_DIR=/home/USERNAME/pharmacies-doctor-data/images`. The `/images/` directory is ignored by Git as an additional safeguard. User uploads should never be deployed from Git.

For remote PostgreSQL, use `sslmode=verify-full` in `DATABASE_URL` and a certificate trusted by the Node host. The older `sslmode=require` spelling currently aliases to full verification in node-postgres but emits a warning and may change meaning in a future major release. This backend also requires certificate verification when the connection string has no SSL mode. If your provider uses a private CA, install/configure that CA before deploying this change; do not disable verification.

Set `PORT` to the numeric port assigned by your hosting service (or omit it for the default 3000). A literal value such as `undefined` now fails startup with a clear configuration error.

## Install

```bash
npm ci --omit=dev
```

## Environment

Copy `.env.example` to `.env` next to `server.js` only on the server and set real credentials. This release loads it in production, with hosting-panel variables taking precedence. Never commit `.env`. Set `DATABASE_URL`, `ADMIN_PASSWORD` and `ADMIN_TOKEN_SECRET` before signing in.

## Start

```bash
NODE_ENV=production npm start
```

Or use the included `ecosystem.config.cjs` with PM2 if PM2 is provided by the hosting environment.

## Health checks

- `GET /health` verifies the process is alive.
- `GET /health/ready` verifies table initialization and PostgreSQL connectivity.

The HTTP listener and CORS preflight start before database initialization. Login remains available during a database outage; data routes return a clear 503 until initialization succeeds.

## Deployment rule

Deploy/replace only the application directory. Do not delete or recreate the persistent data directory.

## Existing tracked images

If `images/` was ever committed to Git, run once from the repository:

```bash
git rm -r --cached images
git add .gitignore
git commit -m "Keep runtime uploads outside Git"
git push origin main
```

`git rm --cached` removes files from Git tracking but does not intentionally delete the local files.


## Release verification

Before deploying a release archive:

```bash
npm ci --omit=dev
npm run check
npm test
```

The production archive intentionally does not contain `.env` or `node_modules`. Copy `.env.example` to a server-local `.env` and install dependencies on the server with `npm ci --omit=dev`. Keep persistent uploaded images outside the application checkout.
