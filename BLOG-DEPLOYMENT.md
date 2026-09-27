# Pharmacies Doctor Blog Routing

## Production architecture

- Public frontend: `https://pharmacies.doctor`
- Node/Express backend: `https://pd.pharmacies.doctor`
- Backend raw template: `https://pd.pharmacies.doctor/blog-post.html`
- Backend article SSR: `https://pd.pharmacies.doctor/blog/<slug>`
- Backend article API: `https://pd.pharmacies.doctor/api/blogs/<slug>`

The Node backend's `/blog/:slug` route loads the raw `blog-post.html` template from the backend URL, injects title/description/canonical/image metadata, and returns HTML.

The static main domain cannot reverse-proxy to the Node process using the previous `[P]` rule on Hostinger/LiteSpeed. Therefore the frontend `.htaccess` uses an internal rewrite:

`/blog/<slug>` -> `blog-post.html?slug=<slug>`

The browser URL remains `/blog/<slug>`. The template then requests the article JSON from the backend.

## Backend deployment

1. Upload this backend project to the Node.js application root.
2. Run `npm ci --omit=dev`.
3. Set the Node.js application URL to `pd.pharmacies.doctor`.
4. Set the startup file to `server.js`.
5. Set production environment variables using `.env.example`.
6. In particular:

`BLOG_TEMPLATE_URL=https://pd.pharmacies.doctor/blog-post.html`

7. Restart the Node.js application.

## Frontend deployment

Upload the frontend project to the document root for `pharmacies.doctor`.

The included `.htaccess` must be present. Do not add a `[P]` reverse proxy rule for `/blog`.

## Expected checks

- `https://pd.pharmacies.doctor/health` -> `{"status":"ok"}`
- `https://pd.pharmacies.doctor/blog-post.html` -> raw HTML template
- `https://pd.pharmacies.doctor/blog/<existing-slug>` -> SSR HTML
- `https://pd.pharmacies.doctor/api/blogs/<existing-slug>` -> JSON
- `https://pharmacies.doctor/blog/<existing-slug>` -> public clean URL
- `https://pharmacies.doctor/blog-post.html?slug=<existing-slug>` -> 301 to `/blog/<slug>`

## Important

Do not put production database or SMTP passwords in the ZIP. Use Hostinger environment variables or a server-side `.env` file that is not publicly accessible.
