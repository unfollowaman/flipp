# PHASE 0 AUDIT REPORT: PDF → TEXT DEVANAGARI EXTRACTION

## 1. Executive Summary
Flipp's PDF → Text tool produces corrupted, unreadable Devanagari (Hindi) text when extracting content from digitally generated PDFs such as `assets/test.pdf`. Words are split apart with arbitrary spaces inserted in the middle (`राजनी ित क` instead of `राजनीतिक`), pre-base vowel signs (matras like `ि` U+093F) are detached and placed before consonants or in isolated tokens, conjunct ligatures are broken, and null bytes (`\u0000`) are inserted throughout the text.

The primary root cause of this failure in Flipp is **false trust in a corrupted native text layer**. The PDF's internal text stream uses custom subset font encodings with incomplete `/ToUnicode` CMap tables and fragmented glyph positioning. However, Flipp's current quality check assumes native extraction is valid whenever Devanagari character count accounts for at least 10% of total characters (`devanagariRatio >= 0.1`). Because `assets/test.pdf` consists of ~75% Devanagari Unicode characters (albeit corrupted ones), Flipp passes the check, **skips OCR entirely**, and outputs the corrupted native PDF.js text layer.

When rendered pages are processed via Tesseract OCR (`hin+eng`), the extracted Hindi text is clean, coherent, and correctly formatted without internal spaces or null bytes.

---

## 2. Current PDF → Text Architecture
The current PDF → Text pipeline is implemented across `tools/pdf-to-text/index.html` and `js/pdf-to-text.js`:

```
PDF File
  │
  ▼
PDF.js Library (pdfjs-dist 4.3.136)
  │
  ▼
pdfDoc.getPage(pageIndex)
  │
  ▼
page.getTextContent()
  │
  ▼
extractTextFromPage(page, textContent, getOcrWorker)
  │
  ├─► Native Text Assembly: pageText = textContent.items.map(i => i.str).join(" ")
  │
  ├─► Heuristic Quality Check:
  │     cleanedLength = pageText.replace(/\s/g, "").length
  │     IF cleanedLength < 5 ──► needsOCR = true (Scanned/Empty)
  │     ELSE IF cleanedLength >= 20:
  │       devanagariRatio = devanagariCount / cleanedLength
  │       IF devanagariRatio < 0.1 AND englishWordCount < 3 ──► needsOCR = true
  │
  ├──► IF needsOCR == true:
  │      Render page at 2.0x scale onto HTML5 Canvas
  │      Pass Canvas directly to Tesseract.js worker (`hin+eng`)
  │      Return OCR text
  │
  └──► IF needsOCR == false:
         Return Native pageText (UNCHECKED)
  │
  ▼
Final TXT Output / Display
```

---

## 3. Reproduction Results
Running Flipp's current pipeline on the primary test fixture (`assets/test.pdf`, a 17-page Class 10 Civics Hindi document) produces the following comparison:

| Source / Method | Character Quality | Word Continuity | Sample Output |
| :--- | :--- | :--- | :--- |
| **A. Visually Rendered PDF** | Clean & Perfect | Fully Intact | `राजनीतिक दलों की केंद्रीय भूमिका होती है।` |
| **B. Native PDF.js Extraction** | Corrupted | Broken & Fragmented | `राजनी ित क दलों की कें द्र ीय भू िम का होती है।` |
| **C. Flipp Output (Current)** | Corrupted | Broken & Fragmented | Identical to B (OCR bypassed completely) |
| **D. Tesseract OCR (`hin+eng`)** | Accurate & Clean | Fully Intact | `राजनीतिक दलों की केंद्रीय भूमिका होती है।` |

---

## 4. Evidence of Corruption
Concrete examples extracted directly from `assets/test.pdf` using Flipp's current pipeline:

1. **Intra-word Artificial Whitespace**:
   - Original: `राजनीतिक` → Extracted: `राजनी ित क`
   - Original: `नीतियों` → Extracted: `नी ित यों`
   - Original: `प्रयासों` → Extracted: `प्र   यासों`
   - Original: `संविधान` → Extracted: `सं िव धान`

2. **Null Character Injections (`\u0000`)**:
   - Original: `जिससे` → Extracted: `\u0000ज ससे`
   - Original: `आर्थिक` → Extracted: `आ \u0000थ क`
   - Original: `निर्वाचित` → Extracted: `िन वा\u0000 िच त`
   - Original: `रिटर्न` → Extracted: `\u0000र ट न\u0000`

3. **Detached Pre-base Dependent Vowel Signs (Matras)**:
   - The short 'i' matra (`ि` U+093F) is detached from its base consonant and output in separate tokens preceded or followed by spaces: `str="िक"`, `str="िप"`, `str="िध"`.

4. **Broken Ligatures and English Words**:
   - Original: `Affidavit` → Extracted: `A ffi davit` (double spaces around ligatures)
   - Original: `विपक्ष` → Extracted: `िव पक्ष`

---

## 5. Root Cause Analysis
The root cause is a combination of two factors:

1. **Defective Native PDF Text Layer (`assets/test.pdf`)**:
   - The PDF generator used subsetting fonts (`g_d0_f1`, `g_d0_f5`, `g_d0_f3`).
   - The font's CMap (`/ToUnicode`) tables map certain glyph indices (such as ra-reph `र्`, virama conjuncts, and special ligatures) to `U+0000` (NUL).
   - Text operators (`TJ`/`Tj`) in the PDF streams split single Hindi words into multiple positioned string fragments. PDF.js exposes each fragment as an item in `textContent.items`.
   - Joining `textContent.items` with `.join(" ")` forces space insertion between intra-word fragments.

2. **Flawed Quality Heuristic in Flipp (`js/pdf-to-text.js`)**:
   - Flipp evaluated `devanagariRatio = devanagariCount / cleanedLength`.
   - In `assets/test.pdf`, Devanagari Unicode characters represent **72.0% to 83.4%** of all characters across all 17 pages.
   - Because `0.72 > 0.1`, Flipp determined `needsOCR = false`.
   - Flipp blindly trusted the native text layer and served the corrupted output to the user.

---

## 6. Native Extraction Analysis
PDF.js's native `getTextContent()` accurately reflects the PDF's internal text stream. It returns text item objects containing `str`, `transform`, `width`, and `fontName`.

When PDF.js parses `assets/test.pdf`, it reads the font's `/ToUnicode` map. When a glyph maps to `\u0000` or when string fragments are separated by positioning commands, PDF.js outputs strings such as `str="लोकतां"`, `str="ित्र"`, `str="क"`.

Joining these items blindly with `" "` destroys Devanagari word boundaries because Devanagari script layout relies on continuous shirorekha (top line) joining consonants and matras into single visual words.

---

## 7. PDF Internal Structure
Inspection of `assets/test.pdf` reveals:
- **Total Pages**: 17
- **Embedded Fonts**: TrueType subset fonts (`g_d0_f1`, `g_d0_f5`, `g_d0_f3`, `g_d0_f4`).
- **`/ToUnicode` CMap Anomalies**: Subsetting maps complex conjuncts and ra-reph glyphs to `U+0000`.
- **Character Ordering**: Pre-base vowel signs (`ि` U+093F) are stored as separate glyph entries placed before consonants in visual rendering order rather than logical Unicode canonical order.
- **Visual vs Structural Divergence**: Visually, the rendered PDF canvas is flawless because glyph outlines and vector coordinates position characters correctly. Structurally, the underlying text layer is severely corrupted.

---

## 8. Current OCR Path Analysis
Flipp already integrates Tesseract.js (v5.0.5) loaded via CDN in `tools/pdf-to-text/index.html`.
- **Configured Languages**: `hin+eng` (Hindi + English).
- **Execution Path**: `worker.recognize(canvas)` where `canvas` is rendered at `scale: 2.0`.
- **Performance**: OCR on a single page takes ~1.2s to 2.5s in-browser.
- **Capabilities**: When forced to run on `assets/test.pdf`, Tesseract.js correctly extracts Hindi text without internal word spaces or null bytes.

---

## 9. Extraction Quality Detection Signals
To reliably determine whether native text extraction is trustworthy without rejecting valid Devanagari PDFs, we measured 3 quantitative signals across all 17 pages of `assets/test.pdf`:

| Metric Signal | Detection Purpose | Threshold / Metric in `test.pdf` | Clean PDF Baseline |
| :--- | :--- | :--- | :--- |
| **Signal 1: Null & Replacement Chars (`\u0000`, `\uFFFD`)** | Detects corrupted CMap / `/ToUnicode` translation | **5 to 31 `\u0000` chars/page** | 0 |
| **Signal 2: Leading / Isolated Devanagari Matras** | Detects detached dependent vowel signs (`\s[\u093e-\u094c\u0901-\u0903]`) | **16 to 42 isolated matras/page** | 0 to 1 |
| **Signal 3: Short Devanagari Token Ratio** | Detects intra-word character fragmentation (1-2 char tokens) | **45.7% to 57.8% short tokens** | < 15% |

### Signal Evaluation:
1. **Signal 1 (`\u0000` / `\uFFFD` Count)**:
   - *What it detects*: CMap mapping failures where glyphs map to null bytes.
   - *Reliability*: Extremely high (100% precision). Valid text never contains `\u0000`.

2. **Signal 2 (Isolated Devanagari Matras)**:
   - *What it detects*: Matras (`ि`, `ी`, `ु`, `ू`, `े`, `ै`, `ो`, `ौ`, `ं`, `ः`) appearing at the start of a token or preceded by a space. In Devanagari orthography, dependent matras CANNOT start a standalone word.
   - *Reliability*: Near 100%. Any occurrence indicates fragmented native text extraction.

3. **Signal 3 (Short Devanagari Token Fragmentation Ratio)**:
   - *What it detects*: Words split into 1-2 character chunks separated by spaces.
   - *Reliability*: Highly reliable when combined with a threshold (e.g., > 30% of Devanagari tokens are 1-2 characters).

---

## 10. Recommended Architecture
We recommend implementing a **Two-Stage Intelligent Extraction Strategy**:

```
                  PDF Page Input
                        │
                        ▼
            Native PDF.js Extraction
             (page.getTextContent)
                        │
                        ▼
           Multi-Signal Quality Checker
  ┌───────────────────────────────────────────┐
  │ 1. Check for NUL (\u0000) or \uFFFD chars  │
  │ 2. Check for isolated Devanagari matras  │
  │ 3. Check short Devanagari token ratio     │
  └───────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
    Quality OK                    Quality BAD
         │                             │
         ▼                             ▼
   Use Native Text             Render Canvas Page (2x)
 (Fast, Instant, 0ms)                  │
                                       ▼
                                Tesseract OCR (`hin+eng`)
                                       │
                                       ▼
                                Use OCR Text
                        │
                        ▼
              Final Extracted Text
```

---

## 11. Tesseract Assessment
- **Role**: Tesseract.js (`hin+eng`) is already integrated in Flipp and can serve immediately as the Phase 1 fallback OCR engine.
- **Verification**: Tested against `assets/test.pdf` in Node sandbox. Successfully reconstructs Devanagari words without spaces or null bytes.
- **Action Needed**: Update `extractTextFromPage` in `js/pdf-to-text.js` to incorporate the Multi-Signal Quality Checker so Tesseract OCR is correctly triggered for corrupted Devanagari text layers.

---

## 12. PaddleOCR Assessment
- **Overview**: PaddleOCR (PP-OCRv4) offers state-of-the-art Devanagari OCR recognition.
- **Feasibility in Flipp**: Can run client-side via ONNX Runtime Web (`onnxruntime-web`) compiling to WebAssembly / WebGPU.
- **Resource Footprint**:
  - Model size: ~10MB - 15MB ONNX model weights.
  - Runtime overhead: ~3MB ONNX WASM binary.
- **Comparison with Tesseract.js**:
  - Tesseract.js is lighter to bundle via CDN and already integrated.
  - PaddleOCR provides higher accuracy on highly complex line wrapping and low-contrast scanned documents.
- **Recommendation**: PaddleOCR should be evaluated as a dedicated Devanagari OCR engine in a future phase after Phase 1 fallback routing is deployed and verified.

---

## 13. Risks and Edge Cases
1. **False Positives (Valid Devanagari PDFs sent to OCR)**:
   - Risk: Retrying valid PDFs through OCR increases processing time needlessly.
   - Mitigation: Ensure quality metrics require multiple failing signals or strict thresholds (e.g., NUL count > 0 OR Isolated Matras > 3 OR Fragmentation Ratio > 35%).

2. **False Negatives (Corrupted PDFs skipping OCR)**:
   - Risk: Outputting corrupted text.
   - Mitigation: Multi-signal scoring ensures that if CMap maps to NUL bytes or matras are isolated, OCR is strictly triggered.

3. **Mixed Language / English PDFs**:
   - Risk: English PDFs with ligatures (`ff`, `fi`) triggered for OCR.
   - Mitigation: Limit Devanagari-specific matra and fragmentation signals to pages where Devanagari character count is significant (`devanagariCount > 10`).

---

## 14. Phase 1 Recommendation
In Phase 1, implement:
1. **Multi-Signal Extraction Quality Checker in `js/pdf-to-text.js`**:
   - Detect NUL (`\u0000`) and replacement (`\uFFFD`) characters.
   - Detect isolated / leading Devanagari matras (`/\s[\u093e-\u094c\u0901-\u0903]/`).
   - Detect abnormal short Devanagari token fragmentation ratios (>35%).
2. **Seamless Fallback Routing**:
   - Route pages failing the quality check to Tesseract.js (`hin+eng`) OCR.
3. **Regression Tests**:
   - Add automated test cases in `tests/` verifying quality checker performance on `assets/test.pdf` and clean synthetic PDFs.
