# Hosting Architecture

This project is natively deployed via Cloudflare Pages using Git integration.

## Deployment Features

- Auto-deployed directly from the repository upon pushing to the designated branch.
- No build step is required; the static files in the repository are served directly.
- Natively supports HTTP 301 server-side routing and custom response headers via `_redirects` and `_headers` files.
- The site operates entirely client-side, using modern browser APIs to process files without uploading to a server.

## Key Configuration Files

- `_redirects`: Defines server-side HTTP 301 redirects, ensuring that legacy tool paths reliably point to their current URLs (e.g., `/pdf-to-png` routes to `/tools/pdf-to-png/`).
- `_headers`: Specifies custom HTTP response headers (e.g., caching rules or security policies) applied to requests directly at the edge.

## Architecture Guidelines

- Do not use client-side javascript-based fallbacks or HTTP `<meta>` refresh tags for routing. Always update the `_redirects` file for any new or modified routes.
- Cloudflare Pages handles apex-domain trailing-slash normalization at the edge. Avoid adding manual trailing-slash redirect rules for the apex domain in the `_redirects` file, as this conflicts with Cloudflare's built-in behavior and can cause infinite redirect loops.
