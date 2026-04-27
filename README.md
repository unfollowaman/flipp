# flipp — File Converter

A fully client-side PDF ↔ PNG/JPG file converter. No backend, no uploads, no account required.
Everything runs in your browser using open-source libraries.

## Features

- **PDF → PNG**: Convert every page (or a custom range) of a PDF into crisp PNG images at 1×, 2× or 3× resolution. Download individually or all as a ZIP.
- **Images → PDF**: Combine one or more PNG/JPG files into a single PDF. Drag to reorder pages. Choose A4, US Letter, or auto-fit page sizes.
- **100% client-side**: Uses [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla) for PDF rendering and [jsPDF](https://artskydj.github.io/jsPDF/) for PDF generation. Nothing is uploaded to any server.
- **Offline-capable**: Works after first load with no internet connection (CDN assets are cached by the browser).

## Libraries used

| Library | Purpose | CDN |
|---|---|---|
| [PDF.js 4.3](https://mozilla.github.io/pdf.js/) | Parse & render PDF pages to canvas | cdnjs |
| [jsPDF 2.5](https://artskydj.github.io/jsPDF/) | Generate PDFs from images | cdnjs |
| [JSZip 3.10](https://stuk.github.io/jszip/) | Bundle multiple PNGs into a ZIP | cdnjs |

## Project structure

```
fileconverter/
├── index.html              # Single-page app entry point
├── css/
│   └── styles.css          # All styles (Candy Brutalism design system)
├── js/
│   ├── drag-drop.js        # Shared drag-drop + toast utilities
│   ├── pdf-to-img.js       # PDF → PNG conversion logic
│   └── img-to-pdf.js       # Images → PDF conversion logic
├── netlify.toml            # Netlify deploy config + headers
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Pages auto-deploy action
```

## Deployment

### GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages → Source → GitHub Actions**
3. The included workflow (`.github/workflows/deploy.yml`) will deploy automatically on push to `main`

### Netlify

1. Drag and drop this folder onto [netlify.com/drop](https://app.netlify.com/drop), **or**
2. Connect your GitHub repo in the Netlify dashboard — no build command needed, publish directory is `.`

### Any static host (Vercel, Cloudflare Pages, S3, etc.)

- No build step required — serve the folder contents as-is
- Set the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers for best PDF.js performance (enables SharedArrayBuffer)

## Local development

```bash
# Any static file server works — for example:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> ⚠️ Do **not** open `index.html` directly via `file://` — browser security restrictions will block some features. Always use a local server.

## Browser support

| Browser | Support |
|---|---|
| Chrome / Edge 90+ | ✅ Full |
| Firefox 90+ | ✅ Full |
| Safari 15.4+ | ✅ Full |
| Mobile Chrome/Safari | ✅ Full |

## License

MIT — free to use, modify, and deploy.
