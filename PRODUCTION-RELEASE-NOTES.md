# Production Release Notes

## Release
Pharmacies Doctor backend — production hardening / SEO release

## Included fixes
- Removed production `.env` from the release archive; use `.env.example` and server-side environment variables.
- Release archive excludes `node_modules`; install with `npm ci --omit=dev` on the server.
- Hardened Base64 image uploads with strict Base64 validation, MIME allow-listing, size limits, and binary signature verification.
- Fixed the HTTPS/proxy integration test so database-unavailable API routes correctly return `503 DATABASE_UNAVAILABLE` while proxied HTTPS remains accepted.
- Strengthened SSR blog metadata with author, publication, modification, category and canonical signals.
- Corrected Privacy Policy metadata and breadcrumb semantics.
- Consolidated two overlapping Tramadol blog URLs with permanent 301 redirects and removed them from the sitemap/internal navigation.
- Optimized public page title tags and meta descriptions for concise search snippets.
- Updated the SEO audit to create its validation directory automatically.

## Verification
- `npm run check` — PASS
- `npm test` — PASS (6/6)
- `npm run check:seo` — PASS (0 errors; 72 pages checked, 65 indexable, 67 sitemap URLs)
