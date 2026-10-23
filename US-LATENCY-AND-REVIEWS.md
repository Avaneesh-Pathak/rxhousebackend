# U.S. latency, review integration, and activity endpoints

## New public endpoints

- `GET /api/catalog-activity` — counts DISTINCT submitted order requests per catalog product during the previous 24 hours, grouped by real order item name. Results exclude personal data and are cached for 5 minutes in process. No request = no activity badge. **Not a completed-purchase metric.**
- `GET /api/public-reviews` — Places API (New) display, true Google reviews and business link, cached for 1 hour in process. No profile/credentials = `reviews: []`; never generates random testimonials.
- `POST /api/assistant` — retained and enhanced with canonical product URLs and image paths in responses.
- `GET /api/products` — retained; 60-second in-process cache avoids repeated PostgreSQL reads.
- Existing `/api/leads`, `/api/leads/status`, `/api/orders`, `/api/order-status`, admin APIs, and authentication are intentionally unchanged.

Place these optional secrets in your backend environment only:

```env
GOOGLE_PLACE_ID=
GOOGLE_PLACES_API_KEY=
```

A Google Business Profile with real reviews, a correct Place ID, and a Google Maps Platform project with Places API (New) access/billing are required. Do not expose the API key in HTML or JS. Returned review content and rating are attributed to Google with links back to the listing. Respect Google's display/attribution rules.

## Improve response time for visitors in the United States

The 800+ ms observed origin latency and Lighthouse's **document request latency estimated saving of 5,040 ms** cannot be removed by JavaScript alone: website location, network RTT, redirects, TLS and origin response time matter. The improvements above reduce transferred CSS and optional database work, but **this package does not physically move your server or configure your CDN**.

1. If your DNS uses Cloudflare, ensure `pharmacies.doctor` is **proxied** (orange cloud), not DNS-only. Enable Brotli and modern HTTPS/TLS. Keep host origin certificates valid. The API domain can also be proxied, with careful CORS and session-cookie testing.
2. In **Caching → Cache Rules**, enable caching for static public HTML GET/HEAD responses under `pharmacies.doctor` while excluding paths such as `/checkout`, `/admin-blog`, `/admin-orders`, `/thankyou` and `/order-confirmation`. On a free account, Cloudflare's edge TTL minimum can be 2 hours. **Purge cache after each deployment.** Do not cache user-specific HTML, `Set-Cookie` responses, POST requests, admin routes or lead/order endpoints.
3. Static `/css`, `/js`, `/fonts`, `/images`, and `/data` are publicly cacheable: these already have server cache headers. Preserve cache keys based on the version query string. Avoid repeatedly renaming resources without cache invalidation.
4. For `pd.pharmacies.doctor`, never cache POST endpoints (assistant, leads, checkout/orders). The only safe candidates for a short shared cache are verified-public **GET** endpoints (`/api/products`, `/api/public-reviews`, `/api/catalog-activity`), using the TTLs in their response headers. Avoid forcing a too-long TTL on real-time activity.
5. If API requests still have high origin latency from the U.S., check Hostinger backend region and PostgreSQL location. Prefer running the Node app close to its DB; consider a U.S. region for both if U.S. shoppers dominate. CDN cannot make an uncached checkout submission instantaneous.
6. Use a U.S. based synthetic test (e.g., WebPageTest U.S. location) on a cold and warm run. Capture LCP, TTFB, FCP, TBT and any first-load font / CSS delays. Don't compare an India-to-U.S. `curl` result to a true U.S. test.

From a **U.S.-located** Linux server, check timings and Cloudflare status:

```bash
curl -sS -o /dev/null -D /tmp/pd-headers.txt \
  -w 'DNS %{time_namelookup}s | TCP %{time_connect}s | TLS %{time_appconnect}s | TTFB %{time_starttransfer}s | TOTAL %{time_total}s | HTTP %{http_code}\n' \
  https://pharmacies.doctor/
grep -iE 'cf-cache-status|cache-control|server|content-encoding' /tmp/pd-headers.txt
```

Repeat twice. `cf-cache-status: HIT` indicates the edge served a cached response. Always exclude checkout and other sensitive routes from edge caching. A 0.5 ms whole-internet response time is not realistic; a nearby edge location can deliver markedly lower TTFB for cached HTML and assets.

Official guidance: https://developers.cloudflare.com/cache/get-started/ and https://developers.google.com/maps/documentation/places/web-service/place-details

## Testing

After installing normal Node dependencies on the backend host:

```bash
npm run check
npm test
curl -i https://pd.pharmacies.doctor/health/ready
curl -i https://pd.pharmacies.doctor/api/public-reviews
curl -i https://pd.pharmacies.doctor/api/catalog-activity
```

The live PostgreSQL/SMTP, actual Google API and U.S. edge performance must be tested after deployment. The development environment used to build this ZIP could validate JavaScript syntax and frontend integrity but could not complete a live npm integration run.
