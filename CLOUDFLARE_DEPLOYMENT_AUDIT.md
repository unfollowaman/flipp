# Cloudflare Pages Deployment Audit & Configuration Report

## 1. Summary of Previous Failure Cause
When the recreated Cloudflare Pages project attempted deployment, Cloudflare Pages native Git integration automatically ran `npm install` because `package.json` was detected in the root directory. This generated a local `node_modules` directory containing heavy test and development binaries (specifically `/opt/buildhome/repo/node_modules/workerd/bin/...` and `puppeteer`). Without build output isolation or ignore configuration, Cloudflare treated the entire repository root as the static asset directory and attempted to upload all files, including `node_modules`, exceeding Cloudflare's 25 MiB single-asset size limit and failing the deployment with `[ERROR] Asset too large`.

## 2. Current Cloudflare State & Repository Audit
- **Site Type:** Zero-server static website with no build step required.
- **Root Directory:** Repository root (`/`) contains all deployable HTML, CSS, JS, SEO, routing, and media assets.
- **Node Modules Tracking:** `node_modules/` is not tracked by Git (`.gitignore` includes `node_modules`).
- **Wrangler Configuration:** No `wrangler.json` or `wrangler.jsonc` file is present.
- **Application Integrity:** The recent file deletion audit removed only unreferenced assets (`trust-pills-hover.png`) and local `node_modules/`. All 180 unit/integration tests pass.

## 3. Recommended Cloudflare Dashboard Settings
Enter these settings in the Cloudflare Pages project settings dashboard under **Settings > Build & deployments > Build configuration**:

- **Framework preset:** `None`
- **Build command:** `exit 0`
- **Build output directory:** `/` (or leaves blank if root is default)
- **Environment variables:**
  - `SKIP_DEPENDENCY_INSTALL`: `true`

### Rationale for Dashboard Settings
- `Build command: exit 0`: Signals to Cloudflare's build runner to immediately succeed without attempting any compilation or bundler script.
- `SKIP_DEPENDENCY_INSTALL=true`: Instructs Cloudflare Pages build environment to skip running `npm install` altogether. Because Flipp processes everything client-side and requires no server-side build step, skipping `npm install` speeds up deployments and prevents `node_modules/` from ever being generated on the build server.

## 4. `.cloudflareignore` Configuration & Reasoning
A `.cloudflareignore` file has been created in the repository root with the following entries:

```ignore
# Cloudflare Pages deployment ignore rules
node_modules/
tests/
.git/
```

### Exclusion Details & Justification
- `node_modules/`: Excludes development/test packages (e.g., `workerd`, `puppeteer`, `playwright`) if `npm install` were ever triggered, preventing asset size limit violations.
- `tests/`: Excludes Node.js test scripts and mock files (`tests/*.test.js`, `tests/test_pdf_to_img.js`) which are for test execution only and not served to end users.
- `.git/`: Excludes Git metadata directory from being uploaded as static site assets.
- **`package.json` / `package-lock.json`:** **Not excluded.** Keeping package configuration files in the deployment ensures full visibility into project metadata and dependency declarations without affecting static serving performance.
- **Production Assets:** All production files (`index.html`, `404.html`, `tools/*`, `blog/*`, `about/*`, `privacy-policy/*`, `css/*`, `js/*`, `assets/*`, `sitemap.xml`, `sitemap-blog.xml`, `robots.txt`, `_headers`, `_redirects`, `ai-plugin.json`, `llms.txt`, manifests, and icons) are explicitly kept and will be served as expected.

## 5. Verification Checklist & Test Results
- **Test Suite Result:** 180 / 180 tests passed (`node --test tests/*.test.js tests/test_pdf_to_img.js`).
- **Production Asset Integrity:**
  - `index.html` & `404.html` verified intact.
  - `_headers` & `_redirects` verified intact.
  - `sitemap.xml`, `sitemap-blog.xml`, & `robots.txt` verified intact.
  - `css/`, `js/`, `assets/`, `tools/`, `blog/`, `about/`, `privacy-policy/` routes verified intact.

## 6. Deployment Instructions & Next Steps
1. Push this branch to the repository.
2. In Cloudflare Pages Dashboard, navigate to the newly created project settings.
3. Configure Environment Variables: Add `SKIP_DEPENDENCY_INSTALL = true`.
4. Configure Build Settings: Set Build Command to `exit 0` and Build Output Directory to `/`.
5. Trigger a new deployment in Cloudflare Pages.
6. Verify deployment success on the generated `*.pages.dev` URL.
7. Perform post-deployment sanity checks (Homepage, Tool pages, Navigation, CSS/JS, Fonts/Images, 404 page, Headers, and Redirects).
8. Once `*.pages.dev` is confirmed working, attach the custom domain.
