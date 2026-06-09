# flipp — File Converter

We don’t upload your files.  
We don’t store your data.  
We don’t slow you down.

**flipp** is a zero-server, fully in-browser file conversion platform built for speed, privacy, and simplicity.  
Everything happens on your device — instantly.

No friction. No compromise. Just results.

---

## 🚀 What flipp does

flipp is designed to eliminate the traditional bottlenecks of file conversion tools.

- No uploads → No waiting  
- No accounts → No barriers  
- No servers → No risk  

You drop a file.  
You choose an action.  
You get your result — immediately.

That’s it.

---

## ⚡ Core Features

### 📄 PDF → PNG
- Convert entire PDFs into high-quality images  
- Adjustable resolution (1×, 2×, 3×)  
- Export individually or as ZIP  

### 🖼️ Images → PDF
- Combine multiple images into a single PDF  
- Drag-and-drop reordering  
- A4 / Letter / Auto sizing  

### 🔗 Merge PDF
- Combine multiple PDFs into one clean document  

### ✂️ Split PDF
- Extract specific page ranges into separate files  

### 🔢 Add Page Numbers
- Fully customizable positioning  
- Start from any page  

### 🔐 Protect PDF
- Password-protect files securely  
- Encryption handled locally  

### 📄 PDF → Text
- Extract text from PDF files online for free
- Automatic OCR support for scanned documents
- Supports English and Hindi

### 📝 Text → PDF
- Convert plain text to clean PDF documents instantly
- Works with text input or text files

### 💧 Add Watermark
- Add custom text or image watermarks
- Full control over opacity, rotation, and placement
- Stamp across all pages instantly

### ✍️ Sign PDF
- Add visual signatures to any PDF
- Draw, upload, or type your signature
- Drag and resize on any page freely

### 🔄 Rearrange PDF
- Visually drag and drop pages to reorder them
- Delete unwanted pages
- Save the new organized document locally


---

## 🧠 How it works (Core Philosophy)

Traditional tools: Your File → Upload → Server → Process → Download

flipp: Your File → Browser → Done


Everything runs locally using modern browser APIs and open-source libraries.

---

## 🧱 Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules)  
- **Styling**: Custom CSS (Candy Brutalism system)  
- **Libraries**:  
  - PDF.js (Mozilla) → PDF parsing & rendering  
  - jsPDF → PDF generation  
  - PDF-lib → Advanced PDF manipulation  
  - JSZip → File bundling  
  - Tesseract.js → OCR / text extraction

---

## 📂 Project Structure
```text
flipp/
├── index.html                    # Landing page (hero, feature overview, navigation)
├── tools/
│   ├── index.html                # Tools hub / listing page
│   ├── pdf-to-png/index.html     # PDF → PNG tool page
│   ├── images-to-pdf/index.html  # Images → PDF tool page
│   ├── merge-pdf/index.html      # Merge PDF tool page
│   ├── split-pdf/index.html      # Split PDF tool page
│   ├── protect-pdf/index.html    # Protect PDF tool page
│   ├── add-page-numbers/index.html # Add page numbers tool page
│   ├── pdf-to-text/index.html    # PDF → Text tool page
│   ├── text-to-pdf/index.html    # Text → PDF tool page
│   ├── add-watermark/index.html  # Add Watermark tool page
│   ├── sign-pdf/index.html       # Sign PDF tool page
│   └── rearrange-pdf/index.html  # Rearrange PDF tool page
├── blog/
│   ├── index.html                # Blog home
│   └── */index.html              # SEO content pages
├── js/
│   ├── drag-drop.js              # Shared drag & drop logic
│   ├── pdf-to-img.js             # PDF → PNG conversion flow
│   ├── img-to-pdf.js             # Images → PDF conversion flow
│   ├── pdf-merge.js              # PDF merge logic
│   ├── pdf-split.js              # PDF split logic
│   ├── pdf-protect.js            # PDF protection logic
│   ├── pdf-page-numbers.js       # PDF page numbering logic
│   ├── pdf-to-text.js            # PDF → Text extraction logic
│   ├── text-to-pdf.js            # Text → PDF utility
│   ├── add-watermark.js          # Add watermark logic
│   └── rearrange-pdf.js          # Rearrange PDF logic
├── css/
│   └── styles.css                # Global design system + component styles
├── sitemap.xml                   # Search indexing map
├── robots.txt                    # Crawler rules
├── _headers                      # Edge/server header config
├── _redirects                    # Route redirects for static hosting
└── deploy.yml                    # Deployment workflow/config
```

## 🗺️ Site Map
```text
/
├── Hero Section
├── Feature Blocks
├── "How It Works"
├── Tool Shortcuts
│   ├── PDF → PNG
│   ├── Images → PDF
│   ├── Merge PDF
│   ├── Split PDF
│   ├── Protect PDF
│   ├── Add Page Numbers
│   ├── PDF → Text
│   ├── Text → PDF
│   ├── Add Watermark
│   ├── Sign PDF
│   └── Rearrange PDF
├── Privacy & Trust Section
└── Footer

/tools
├── /tools/                       # Tools index
├── /tools/pdf-to-png/
├── /tools/images-to-pdf/
├── /tools/merge-pdf/
├── /tools/split-pdf/
├── /tools/protect-pdf/
├── /tools/add-page-numbers/
├── /tools/pdf-to-text/
├── /tools/text-to-pdf/
├── /tools/add-watermark/
├── /tools/sign-pdf/
└── /tools/rearrange-pdf/

/blog
├── /blog/
└── /blog/*                       # Educational article pages
```

---

## 🔐 Privacy First

- No file uploads  
- No backend processing  
- No tracking  
- Works offline after initial load  

Your data never leaves your device.

---

## ⚙️ Deployment

### GitHub Pages
- Push to `main`  
- Auto-deploy via workflow  

### Netlify / Vercel / Cloudflare
- No build step required  
- Deploy as static site  
