# Question Paper Extractor & Studio (100% Client-Side / Zero-API)

An advanced, browser-based web application to extract, parse, edit, practice, and export question papers from **PDFs, Scanned Photos/Images, Word Documents (.docx), and Raw Text** without needing any external or paid cloud API keys.

---

## 🌟 Key Features

- **⚡ Zero External API & 100% Client-Side**: All parsing, Optical Character Recognition (OCR), document extraction, and math rendering run entirely inside the user's browser.
- **📄 Multi-Format Ingestion**:
  - **PDF Documents**: Direct layout-aware text extraction via `PDF.js`.
  - **Scanned Images & Photos**: In-browser OCR via `Tesseract.js` Web Workers (supports multi-page photo uploads).
  - **Microsoft Word Documents**: Direct `.docx` parsing via `Mammoth.js`.
  - **Raw Text**: Instant paste and parse.
- **🧠 Smart Heuristic & NLP Question Parser**:
  - **Header & Exam Metadata**: Detects Exam Title, Subject, Class/Grade, Time Allowed, Maximum Marks, and General Instructions.
  - **Section Partitioning**: Segments papers into Section A, Section B, Part 1, Part 2, etc., with section-specific descriptions and marks.
  - **Question Segmentation**: Recognizes standard numbering styles (`1.`, `Q1.`, `Q.1`, `Question 1:`, `(1)`, `[1]`, `I.`, `(a)`, `(i)`).
  - **MCQ Option Detection**: Extracts inline and multi-line options (`(A)`, `(B)`, `(C)`, `(D)` / `a)`, `b)`, `c)`, `d)`), identifies answer keys and marks.
  - **Sub-Questions**: Captures nested parts (`(a)`, `(b)`, `(i)`, `(ii)`) with individual marks.
  - **Question Type Classification**: Auto-tags as Multiple Choice (MCQ), Short Answer, Long Answer, Numerical/Math, True/False, Fill in Blanks, or Match the Following.
  - **Math & Formula Formatting**: Automatically detects equations and renders mathematical notation using KaTeX.
- **🛠️ Interactive Question Studio**:
  - Add, edit, duplicate, and delete questions inline.
  - Live search and filter by Section or Question Type.
  - Dynamic marks verification (checks if sum of question marks matches the exam paper's stated total marks).
- **📝 Interactive Mock Test / Quiz Mode**:
  - Take the extracted question paper as an interactive online exam.
  - Live countdown timer with color alert.
  - Question Palette (Answered, Unanswered, Flagged for Review).
  - Instant auto-grading, accuracy percentage, and scorecard breakdown.
- **💾 Universal Export Center**:
  - **Printable Paper / PDF**: Clean, beautiful layout ready for physical printing or PDF saving.
  - **Word Document (.doc)**: Formatted exam paper ready for Microsoft Word.
  - **Structured JSON**: Machine-readable schema containing full metadata, sections, questions, choices, answers, and marks.
  - **CSV / Spreadsheet**: Tabular question bank for Excel or Google Sheets.
  - **Markdown (.md)**: Clean documentation with tables and KaTeX formulas.
  - **LaTeX Exam (.tex)**: Ready for compilation with `\documentclass{exam}`.
  - **Google Forms / Quizizz / Kahoot Format**: CSV formatted for bulk import.
- **🏛️ Persistent Multi-Paper Vault**:
  - Offline in-browser database powered by **IndexedDB** (with seamless localStorage fallback).
  - Automatically archives every uploaded and extracted exam paper locally.
  - Multi-paper repository management: browse past papers, view total questions and marks, load any paper into the editor workspace, delete papers, and export/import full repository JSON backups.
- **🔮 Cross-Exam Intelligence & Pattern Discovery Studio (Powered by Gemini AI)**:
  - Select any combination of historical question papers (e.g. 2015, 2016, 2018, 2024) to uncover how the examination board designs the paper.
  - **Executive Architecture Blueprint**: Extracts question count, duration, scoring/negative marking rules, target pace (seconds per question), and examiner philosophy.
  - **Cognitive Level Distribution**: Quantifies Bloom's taxonomy percentages (Level 1 Factual Recall, Level 2 Conceptual Application, Level 3 Complex Synthesis).
  - **Multi-Year Topic Weightage Heatmap**: Frequency matrix, weightage percentages, recurrence rates across years, and rising/falling trend trajectories.
  - **Examiner Trap & Formulation Analysis**: Identifies tricky question styles (multi-statement evaluation, match matrix tables, close distractors, bilingual nuances).
  - **Predictive Next-Exam Blueprint**: AI forecast of expected question distributions, high-yield hotspots, and top 10 must-master topics.
  - **Actionable 3-Round Strategy**: Phase-by-phase time allocation (Round 1 Speed Kills, Round 2 Solvable Calculations, Round 3 Review & Risk Management) with candidate DOs & DON'Ts.
  - **Publication-Grade Export**: 1-click Markdown export, clipboard copy, and formatted PDF printouts.
- **🚀 Preloaded Sample Question Papers**:
  - Telangana State Police Constable Preliminary Examination (200 Marks)
  - Online CBT Response Sheet (150 Marks)
  - Class 10 CBSE Mathematics (80 Marks)
  - Class 12 Physics (70 Marks)
  - Class 12 Computer Science / Python (70 Marks)
  - General Knowledge & Trivia Olympiad (10 Marks)

---

## 🚀 How to Run

1. Simply double-click `index.html` to open it in any modern browser (Chrome, Edge, Firefox, Safari, Brave).
2. Alternatively, serve it using any local web server:
   ```bash
   # Using Python 3:
   python -m http.server 8000
   
   # Or using Node.js:
   npx serve .
   ```
3. Open `http://localhost:8000` in your web browser.
4. Run the automated test suite in browser: `http://localhost:8000/test.html` or in terminal: `node test_e2e_vault_flow.js`.

---

## 📁 File Structure

```
question-paper-extractor/
├── index.html                  # Main single-page web application & Pattern Studio
├── test.html                   # In-browser automated verification & speed benchmarks
├── README.md                   # Documentation and usage guide
├── css/
│   └── styles.css              # Responsive styling, glassmorphism, print CSS
└── js/
    ├── app.js                  # UI coordinator, Paper Vault & Pattern Studio controller
    ├── paper-vault.js          # Persistent IndexedDB multi-paper vault & backup manager
    ├── paper-analyzer.js       # Cross-paper digest compiler & Gemini AI pattern analyzer
    ├── gemini-handler.js       # Multi-key rotating pool, auto-failover, model selector
    ├── extractor.js            # NLP & rule-based question paper parser engine
    ├── pdf-handler.js          # Client-side PDF text & diagram extraction (PDF.js)
    ├── ocr-handler.js          # In-browser OCR for scanned images (Tesseract.js)
    ├── docx-handler.js         # Word document extractor (Mammoth.js)
    ├── quiz-mode.js            # Interactive mock test runner & auto-scorer
    ├── exporter.js             # Multi-format export engine (PDF, Word, JSON, CSV, LaTeX, MD)
    └── samples.js              # Pre-loaded sample exams for instant testing
```
