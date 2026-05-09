# Hosting Architecture (GitHub Pages)

This project is deployed as a static site on GitHub Pages.

## What GitHub Pages can and cannot do

GitHub Pages **can**:
- Serve static files directly from the deployed artifact
- Route by file and folder structure (for example, `/tools/pdf-to-png/` from `tools/pdf-to-png/index.html`)
- Serve a root `404.html` when no file path matches
- Use a custom domain via the `CNAME` file

GitHub Pages **cannot**:
- Process Netlify `_redirects` rules
- Process Netlify `_headers` rules
- Run server-side middleware, edge functions, or backend code
- Override response headers via repository files

## GitHub Pages-specific files

- `CNAME`: binds the site to `unfollowaman.tech`
- `.nojekyll`: disables Jekyll processing so underscore-prefixed files are included
- `404.html`: handles not-found behavior and client-side fallback redirects for legacy paths

## Netlify-specific files (inert on GitHub Pages)

- `_redirects`: kept for migration compatibility; ignored by GitHub Pages
- `_headers`: kept for migration compatibility; ignored by GitHub Pages

## Redirect behavior on this host

Because GitHub Pages has no native redirect rules, legacy flat tool paths are handled in `404.html` with JavaScript-based path mapping to `/tools/.../` URLs.

Important limitation: these are client-side redirects, not HTTP 301 redirects.

## Deploy workflow

Deployment is handled by `deploy.yml` and publishes the repository root (`path: '.'`) to GitHub Pages.

Automatic deploys run on pushes to `main` except when only ignored paths changed. Manual deploys are always available through `workflow_dispatch`.

A pre-upload verification step checks for critical files (`index.html`, `CNAME`, `robots.txt`, `sitemap.xml`, and key `tools/*/index.html` pages) and fails the run if any are missing.

## Custom domain requirements

`CNAME` must exist at the repository root and contain exactly one line:

`unfollowaman.tech`

Do not include `https://` or `www.` in `CNAME`.

If `CNAME` is removed, GitHub Pages will revert to the repository `*.github.io` domain on the next deploy, which breaks canonical URLs, schema URLs, and sitemap consistency.

## If you need server-side redirects or custom headers

Migrate hosting to a platform that supports them (for example Netlify, Cloudflare Pages, or Vercel). The existing `_redirects` and `_headers` files can serve as a starting point for a Netlify migration.
