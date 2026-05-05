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

---

## 📂 Project Structure
fileconverter/
├── index.html # Main app entry
├── css/
│ └── styles.css # All styles
├── js/
│ ├── drag-drop.js # Shared utilities
│ ├── pdf-to-img.js # PDF → PNG
│ ├── img-to-pdf.js # Images → PDF
│ ├── pdf-merge.js # Merge PDFs
│ ├── pdf-split.js # Split PDFs
│ ├── pdf-protect.js # Protect PDFs
│ └── pdf-page-numbers.js # Add page numbers
├── .github/workflows/
│ └── deploy.yml # GitHub Pages deployment

## 🗺️ Site Map
/
├── Hero Section
├── How It Works
├── PDF → PNG
├── Images → PDF
├── Merge PDF
├── Protect PDF
├── Split PDF
├── Add Page Numbers
└── Footer

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
