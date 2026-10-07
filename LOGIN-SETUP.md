# Fixing the admin login

The supplied screenshot shows HTTP 503 on the OPTIONS preflight to `/api/admin/login`, followed by a browser CORS failure. This happens before the password can be verified. It points to an unavailable backend or hosting proxy, not evidence of an incorrect password.

The previous backend ignored `.env` in production, despite its deployment instructions saying to create one. It also completed database initialization before opening its HTTP listener. This release fixes both behaviors. It does not change the password for you or install credentials into the frontend.

## Deploy the backend

1. Back up the existing application and retain your existing PostgreSQL database and uploaded images.
2. Upload the contents of `pharmacies-doctor-backend` to the Node application's directory on `pd.pharmacies.doctor`. `server.js` and `package.json` belong in that application root, not the static frontend's root.
3. Select Node.js 22 or newer. The dependency lockfile requires a newer runtime than the old README's Node 18 minimum.
4. Run `npm ci --omit=dev` in the backend directory. Use `npm start` (which runs `node server.js`) as the startup command.
5. Configure the environment below in your hosting panel, or create a server-local `.env` next to `server.js` from `.env.example`. Hosting-panel variables override the `.env` file. The file is loaded in production and is independent of the launch working directory.
6. Restart or redeploy the Node application. If using the included PM2 configuration, run `pm2 startOrReload ecosystem.config.cjs --update-env`.

Required settings:

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | Your existing PostgreSQL connection string |
| `ADMIN_PASSWORD` | The admin password you choose; use this exact value in the website login |
| `ADMIN_TOKEN_SECRET` | A separate randomly generated signing secret |
| `CORS_ORIGINS` | `https://pharmacies.doctor,https://www.pharmacies.doctor` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` unless your host requires another bind address |
| `PORT` | Use the port assigned by your hosting service; default is `3000` |

Retain the existing SMTP, order-tax, order-shipping and upload-directory settings. If using `.env`, quote a password containing spaces or `#`. Leave `UPLOAD_DIR` empty to use the existing default or set a real writable persistent path; do not use the old `/home/USERNAME/...` placeholder.

Generate a signing secret in your own server terminal:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Store that output as `ADMIN_TOKEN_SECRET`. Do not use it as the login password. There is no default admin password, and this release does not accept the old password embedded in a frontend script unless you explicitly set it as `ADMIN_PASSWORD` on the server.

## Verify the service

Open `https://pd.pharmacies.doctor/health`: it should return HTTP 200 with `status: "ok"`.

Open `https://pd.pharmacies.doctor/health/ready`: it should return HTTP 200 with `status: "ready"` once PostgreSQL and table initialization succeed. A 503 here means database setup/connectivity still needs attention. Database operations remain blocked until initialization succeeds; the application retries initialization every ten seconds.

Check the login preflight without sending a password:

```bash
curl -i -X OPTIONS https://pd.pharmacies.doctor/api/admin/login -H "Origin: https://pharmacies.doctor" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

Expected: HTTP 204 and `Access-Control-Allow-Origin: https://pharmacies.doctor`.

| Result | Meaning / next action |
| --- | --- |
| `/health` or OPTIONS returns a hosting-generated 502/503 | Check Node application startup logs, application root, entry point, assigned port and proxy configuration. The request is not reaching the running Express application. |
| Login POST returns 503 with `ADMIN_NOT_CONFIGURED` | Set both admin environment variables, then restart. |
| Login POST returns 401 with `INVALID_CREDENTIALS` | Use the exact server-side `ADMIN_PASSWORD`. |
| Login POST returns 404 | An old backend or incorrect route is deployed. |
| Login POST returns 429 | Wait for the fifteen-minute login rate-limit window. |
| Login succeeds but data routes return `DATABASE_UNAVAILABLE` | Check PostgreSQL settings and `/health/ready`. |
| Browser blocks the request but `/health` works | Confirm the actual frontend origin is in `CORS_ORIGINS`; add a staging origin explicitly if you use one. |

## Matching frontend patch

The separate `pharmacies-doctor-frontend-login-patch.zip` contains `admin-orders.html`, `admin-blog.html` and `js/admin-auth.js`. Replace those files in the static frontend's root and `js` folder. Keep the rest of the previously delivered frontend. Purge cached HTML after updating.

Both admin screens now use the same login helper. They distinguish an incorrect password from a backend/CORS outage, configuration error, missing endpoint or rate limit. Password whitespace is preserved, and repeated clicks while a login is pending are ignored.

## Tests and limits

Run `npm run check` and `npm test`. Automated integration tests exercise real Express HTTP requests, CORS preflight, correct/incorrect passwords, token validation, missing admin settings, environment precedence, rate limits and startup with an unavailable database.

Browser checks cover both admin screens against the running backend. Live hosting configuration, production PostgreSQL migrations, email delivery and real orders have not been tested or changed by this package.
