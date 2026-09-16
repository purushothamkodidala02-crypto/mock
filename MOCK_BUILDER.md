# Mock Paper Builder

Open **Mock Builder** in the top navigation. Save reviewed previous papers in Paper Vault first.

1. Select source papers, enter an exam name and analyze. All questions are classified in batches of 20. Interrupted analysis resumes when the same papers and exam name are selected.
2. Inspect topic weights, styles and reasoning depth. Expand the editor to adjust blueprint rows, then save a reviewed version. Each mock references an immutable blueprint version.
3. Choose full or subject mock, question count and `permanent` / `review`. Create a draft to save its complete slot allocation.
4. Generate in batches of up to 15. Each accepted batch is persisted immediately. Resume from My Mocks after a failure or on another day. Pause finishes and saves the current batch first.
5. Open question review and verify each question, options, answer and explanation. Save as reviewed. Export is gated on complete generation and review.
6. Export a real XLSX workbook with the exact 22 import columns. Configure importer difficulty values, active value and answer format if needed.

## History rules

Full mocks cannot repeat questions previously reserved in another full mock. Subject mocks use a separate history. Optional reuse selects reviewed questions used only in the other category, matching the next planned slots, and retains the original import key. Shared questions are locked against wording changes so both saved mocks remain consistent. Re-exporting does not record another use.

Exact normalized text, lexical similarity and semantic fingerprints screen duplicates, followed by a separate AI verification call using nearby previous questions. This is a heuristic screen, not a mathematical guarantee of semantic uniqueness. AI answer checks still require human review. Image-only questions are not generated; textual passages and tables are self-contained within each question.

## Storage and recovery

Mock state uses a separate IndexedDB database (`MockBuilderDB`) and Web Locks to serialize generation and writes across tabs. A localStorage fallback is used only if IndexedDB is absent; storage errors are surfaced. Normal browser storage persists across days, but is local to the browser profile and origin. Use Download backup before clearing data or moving computers. Backup includes extracted source papers, analysis reports, blueprint versions, mocks and question usage. Original PDF binaries are not included. Restore merges identical records and refuses conflicting versions to avoid losing newer history.

English subject rows contain only English language fields; Telugu subject rows only Telugu fields; other subjects have both. Generated source references identify the blueprint. `source_exam_date`, `review_on` and `expires_on` are blank. Defaults are `easy/medium/hard`, `A/B/C/D`, and `true`; verify the target importer's requirements. There is no importer in this repository to test against.

## Verification

- `node test_mock_builder.js`: slot allocation, source-analysis resume, generation resume, review gate, duplicate rejection, cross-category reuse, lifecycle, language handling and backup round-trip.
- `test_mock_browser.html`: isolated browser fixture using its own database and simulated AI. Use one question for fixture generation. Verifies IndexedDB, Web Locks and the authoring UI without API keys.
- Workbook output is a dependency-free OOXML ZIP using inline strings. The regression workbook in the OS temporary directory can be opened with Excel or openpyxl to check Unicode, blanks and column order.

Live Gemini generation requires the user's configured API keys and is subject to service availability. The automated and browser fixtures simulate AI responses.
