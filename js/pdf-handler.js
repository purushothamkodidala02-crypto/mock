/**
 * PDF Handler - Client-Side Text & Embedded Image Extraction using PDF.js
 * Zero API required - Runs 100% inside the browser
 */

class PDFHandler {
  constructor() {
    this.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (this.pdfjsLib) {
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  /**
   * Extracts text, embedded diagram images, and page layouts from an ArrayBuffer or File
   * @param {File|ArrayBuffer} fileOrBuffer 
   * @param {Function|Object} optionsOrProgress
   * @param {Function} onProgress (optional callback { current, total, percent, status })
   * @returns {Promise<{ text: string, numPages: number, pageTexts: string[], images: Array, imagesByPage: Object }>}
   */
  async extractText(fileOrBuffer, optionsOrProgress = null, onProgress = null) {
    let callback = onProgress;
    let extractImages = false;

    if (typeof optionsOrProgress === 'function') {
      callback = optionsOrProgress;
    } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
      extractImages = optionsOrProgress.extractImages || false;
      if (typeof onProgress === 'function') {
        callback = onProgress;
      }
    }

    if (!this.pdfjsLib) {
      this.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (this.pdfjsLib) {
        this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      } else {
        throw new Error('PDF.js library is not loaded. Please ensure internet access to load CDN.');
      }
    }

    let arrayBuffer;
    if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
      arrayBuffer = fileOrBuffer;
    }

    const loadingTask = this.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const pageTexts = [];
    const imagesByPage = {};
    const allImages = [];
    let fullText = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (callback) {
        const pct = Math.round((pageNum / numPages) * 100);
        const statusMsg = `Extracting PDF Page ${pageNum} of ${numPages}...`;
        const progressObj = {
          current: pageNum,
          total: numPages,
          percent: pct,
          status: statusMsg
        };
        // Normalize callback invocation for both object (p) => {} and (msg, pct) => {} callers
        try {
          callback(progressObj, pct);
        } catch (_) {
          try {
            callback(statusMsg, pct);
          } catch (e) {
            console.warn('Progress callback error:', e);
          }
        }
      }

      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Reconstruct formatted text
      const pageLines = this.reconstructLinesFromTextContent(textContent);
      const pageText = pageLines.join('\n');
      pageTexts.push(pageText);
      fullText += `\n--- [Page ${pageNum}] ---\n` + pageText + '\n';

      // Extract embedded raster images if requested
      if (extractImages) {
        try {
          const pageImages = await this.extractImagesFromPage(page, pageNum);
          if (pageImages && pageImages.length > 0) {
            imagesByPage[pageNum] = pageImages;
            allImages.push(...pageImages);
          }
        } catch (imgErr) {
          console.warn(`Error extracting images from page ${pageNum}:`, imgErr);
        }
      }
    }

    return {
      text: fullText,
      fullText: fullText, // Backward compatibility for callers accessing .fullText
      numPages: numPages,
      pageTexts: pageTexts,
      images: allImages,
      imagesByPage: imagesByPage
    };
  }

  /**
   * Assesses the quality and reliability of extracted PDF page text.
   * Replaces primitive character-length checks with holistic quality validation:
   * - Identifies Latin-1 mojibake (e.g. à°, à± in Telugu)
   * - Detects Private Use Area (PUA) unmapped font symbols
   * - Detects scrambled canvas drawing order (option numbers interleaved into sentences)
   * - Identifies complex math equations prone to fraction-bar loss in text layers
   * - Flags scanned/empty pages
   *
   * @param {string} pageText
   * @returns {{ isReliable: boolean, score: number, reasons: string[], hasMath: boolean, hasBilingual: boolean, isScanned: boolean }}
   */
  hasLegacyFontCorruption(text) {
    if (typeof text !== 'string') return false;
    // Legacy Telugu fonts expose Latin glyph codes instead of Unicode Telugu.
    // Require repeated distinctive sequences, not ordinary accents or math symbols.
    const markers = text.match(/(?:µR∂|LRi[WV]|xqsLi|Æ[™\u0099]s|NTP|sªRΩ)/g) || [];
    const encodedTokens = text.split(/\s+/).filter(token =>
      /[A-Za-z]/.test(token) &&
      (token.match(/[∂ﬂ≤≥™¤¡Õﬁ©´ªΩ≠]/g) || []).length >= 2
    );
    return (markers.length >= 2 && encodedTokens.length >= 1) || encodedTokens.length >= 3;
  }

  assessPageTextQuality(pageText) {
    if (!pageText || typeof pageText !== 'string') {
      return { isReliable: false, score: 0, reasons: ['empty_content'], hasMath: false, hasBilingual: false, isScanned: true };
    }

    const trimmed = pageText.trim();
    if (trimmed.length < 40) {
      return { isReliable: false, score: 0, reasons: ['minimal_text_or_scanned'], hasMath: false, hasBilingual: false, isScanned: true };
    }

    const reasons = [];
    if (this.hasLegacyFontCorruption(trimmed)) {
      reasons.push('legacy_font_encoding_corruption');
    }

    // 1. Mojibake detection (UTF-8 bytes decoded as Latin-1 / Windows-1252)
    // Telugu / Indic: à°, à±, à¤, à¥, à¦, à§, etc.
    const mojibakeMatches = trimmed.match(/(?:à[°±²³´µ¶·¸¹º»¼½¾¿]|à[¤¥¦§®¯]|Ã[¢©—]|â[€™€œ"•])/g) || [];
    // Private Use Area (PUA) unmapped font encodings
    const puaMatches = trimmed.match(/(?:[\uE000-\uF8FF\uFFF0-\uFFFF]|[\uDB80-\uDBFF][\uDC00-\uDFFF]|\uFFFD)/g) || [];
    
    if (mojibakeMatches.length >= 3) {
      reasons.push(`mojibake_encoding_corruption_${mojibakeMatches.length}`);
    }
    if (puaMatches.length >= 3) {
      reasons.push(`unmapped_pua_fonts_${puaMatches.length}`);
    }

    // 2. Scrambled reading order / interleaved layout detection
    // E.g. Question number appearing after a word inside a sentence: "teacher 3. (1) are" or "socks 1. (1) has"
    const midSentenceQNums = trimmed.match(/[a-z]{3,}\s+\d+[\.\)]\s+(?:\([1-4a-dA-D]\)|[1-4][\.\)])/g) || [];
    // Or multiple option numbers immediately preceding stem predicate words: "(1) has (2) have... been missing"
    const optionsFollowedByStem = trimmed.match(/(?:\([1-4]\)\s+\w+\s+){2,}(?:been|completed|implement|yesterday|tomorrow|because|which|where|from\s+my)\b/i) || [];
    if (midSentenceQNums.length > 0 || optionsFollowedByStem.length > 0) {
      reasons.push(`scrambled_reading_order_interleaved_${midSentenceQNums.length + optionsFollowedByStem.length}`);
    }

    // 3. Complex mathematical layouts
    // In PDF text layers, fractions lose their horizontal bar and square roots lose radicals.
    const mathIndicators = trimmed.match(/(?:\\frac|\b(?:LCM|HCF)\b|[\d]+\s*of\s*[-+]+\s*[\d]+|\b\d+\s*[\+\-\*\/=]\s*4\^[A-Za-z0-9]|\b\d+\s*[\/÷]\s*\d+\s*=\s*|\b\d+\s*\\overline|\b\d+\s*-\s*à°¸à±†à°•à°‚à°¡à±|[\d\.\^]+\s*[\+\*x×]\s*[\d\.\^]+\s*=\s*[a-zA-Z0-9\^]+)/g) || [];
    const hasMath = mathIndicators.length >= 2 || /\\(?:frac|sqrt|times|div|pm)/.test(trimmed);
    if (hasMath) {
      // Check if text has broken arithmetic tokens e.g. "of -+ 6" or missing operators
      const brokenMathTokens = trimmed.match(/of\s*[-+]+\s*\d+|\d+\s*[\+\-]\s*=\s*4\^/g) || [];
      if (brokenMathTokens.length > 0 || mojibakeMatches.length > 0) {
        reasons.push('complex_math_layout_distortion');
      }
    }

    // 4. Broken short-token ratio (text layer emitting 1-2 char fragments per line)
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 15) {
      const veryShortLines = lines.filter(l => l.length <= 3).length;
      if (veryShortLines / lines.length > 0.4) {
        reasons.push('fragmented_canvas_text_stream');
      }
    }

    // 5. Genuine regional Telugu / Indic text detection
    const teluguMatches = trimmed.match(/[\u0C00-\u0C7F]/g) || [];
    const hasBilingual = teluguMatches.length >= 10 || mojibakeMatches.length >= 3;

    const isReliable = reasons.length === 0;
    const penalty = reasons.length * 30 + mojibakeMatches.length * 5 + puaMatches.length * 5;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    return {
      isReliable,
      score,
      reasons,
      hasMath: hasMath || mathIndicators.length > 0,
      hasBilingual,
      isScanned: false
    };
  }

  /**
   * Groups text items into coherent horizontal lines while respecting column gutters
   */
  reconstructLinesFromTextContent(textContent) {
    if (!textContent || !textContent.items || textContent.items.length === 0) {
      return [];
    }

    const items = textContent.items;
    const lineBuckets = [];
    const yTolerance = 4.0;

    for (const item of items) {
      const str = item.str;
      if (!str || str.trim().length === 0) continue;

      const tx = item.transform;
      const x = tx[4];
      const y = tx[5];
      const width = item.width || 0;

      let placed = false;
      for (const bucket of lineBuckets) {
        if (Math.abs(bucket.y - y) <= yTolerance) {
          bucket.items.push({ str, x, y, width });
          placed = true;
          break;
        }
      }

      if (!placed) {
        lineBuckets.push({
          y: y,
          items: [{ str, x, y, width }]
        });
      }
    }

    lineBuckets.sort((a, b) => b.y - a.y);

    const lines = [];
    for (const bucket of lineBuckets) {
      bucket.items.sort((a, b) => a.x - b.x);

      // Check for large horizontal gap indicating multi-column bleed on the same horizontal line
      let currentLineParts = [];
      for (let i = 0; i < bucket.items.length; i++) {
        const it = bucket.items[i];
        if (i > 0) {
          const prev = bucket.items[i - 1];
          const prevEnd = prev.x + (prev.width > 0 ? prev.width : 25);
          const gap = it.x - prevEnd;
          // If gap between text blocks on the same horizontal line exceeds 45 points (~15mm column gutter), emit as separate line
          if (gap > 45 && currentLineParts.length > 0) {
            const lText = currentLineParts.map(p => p.str).join(' ').trim();
            if (lText.length > 0) lines.push(lText);
            currentLineParts = [];
          }
        }
        currentLineParts.push(it);
      }
      if (currentLineParts.length > 0) {
        const lineText = currentLineParts.map(it => it.str).join(' ').trim();
        if (lineText.length > 0) {
          lines.push(lineText);
        }
      }
    }

    return lines;
  }

  /**
   * Extracts raster bitmap images from a PDF page using getOperatorList
   */
  async extractImagesFromPage(page, pageNum) {
    const images = [];
    const ops = await page.getOperatorList();
    const fns = ops.fnArray;
    const args = ops.argsArray;

    for (let i = 0; i < fns.length; i++) {
      if (fns[i] === this.pdfjsLib.OPS.paintImageXObject || fns[i] === this.pdfjsLib.OPS.paintInlineImageXObject) {
        const imgKey = args[i][0];
        try {
          const imgObj = await new Promise((resolve) => {
            page.objs.get(imgKey, (obj) => resolve(obj));
          });

          if (imgObj && (imgObj.data || imgObj.bitmap)) {
            if (imgObj.width >= 30 && imgObj.height >= 30) {
              const canvas = document.createElement('canvas');
              canvas.width = imgObj.width;
              canvas.height = imgObj.height;
              const ctx = canvas.getContext('2d');

              let imgData = null;
              if (imgObj.data) {
                if (imgObj.kind === 3 || imgObj.data.length === imgObj.width * imgObj.height * 4) {
                  imgData = new ImageData(new Uint8ClampedArray(imgObj.data), imgObj.width, imgObj.height);
                } else if (imgObj.kind === 2 || imgObj.data.length === imgObj.width * imgObj.height * 3) {
                  const rgba = new Uint8ClampedArray(imgObj.width * imgObj.height * 4);
                  for (let p = 0, q = 0; p < imgObj.data.length; p += 3, q += 4) {
                    rgba[q] = imgObj.data[p];
                    rgba[q + 1] = imgObj.data[p + 1];
                    rgba[q + 2] = imgObj.data[p + 2];
                    rgba[q + 3] = 255;
                  }
                  imgData = new ImageData(rgba, imgObj.width, imgObj.height);
                } else if (imgObj.kind === 1 || imgObj.data.length === imgObj.width * imgObj.height) {
                  const rgba = new Uint8ClampedArray(imgObj.width * imgObj.height * 4);
                  for (let p = 0, q = 0; p < imgObj.data.length; p++, q += 4) {
                    const val = imgObj.data[p];
                    rgba[q] = val;
                    rgba[q + 1] = val;
                    rgba[q + 2] = val;
                    rgba[q + 3] = 255;
                  }
                  imgData = new ImageData(rgba, imgObj.width, imgObj.height);
                }
              } else if (imgObj.bitmap) {
                ctx.drawImage(imgObj.bitmap, 0, 0);
              }

              if (imgData) {
                ctx.putImageData(imgData, 0, 0);
              }

              const dataUrl = canvas.toDataURL('image/png');
              if (dataUrl && dataUrl.length > 200) {
                images.push({
                  pageNum: pageNum,
                  dataUrl: dataUrl,
                  width: imgObj.width,
                  height: imgObj.height,
                  imgKey: imgKey
                });
              }
            }
          }
        } catch (e) {
          console.warn('Error reading image object from page:', imgKey, e);
        }
      }
    }

    return images;
  }

  /**
   * Fast metadata inspection to obtain page count
   */
  async getPDFInfo(fileOrBuffer) {
    if (!this.pdfjsLib) {
      this.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    }
    let arrayBuffer = fileOrBuffer instanceof File || fileOrBuffer instanceof Blob ? 
      await fileOrBuffer.arrayBuffer() : fileOrBuffer;
    const loadingTask = this.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    return {
      numPages: pdfDoc.numPages
    };
  }

  /**
   * Renders multiple pages of a PDF to raw base64 JPEG images for Gemini Vision
   * Uses high-resolution scale (2.0 = ~150-200 DPI) for crisp KaTeX math formulas and regional scripts
   */
  async renderPagesToJPEGs(fileOrBuffer, pageNumbers = [], scale = 2.0, onProgress = null) {
    if (!this.pdfjsLib) {
      this.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    }
    let arrayBuffer = fileOrBuffer instanceof File || fileOrBuffer instanceof Blob ? 
      await fileOrBuffer.arrayBuffer() : fileOrBuffer;
    const loadingTask = this.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const results = [];
    const targets = pageNumbers.length > 0 ? pageNumbers : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

    for (let i = 0; i < targets.length; i++) {
      const pNum = targets[i];
      if (pNum < 1 || pNum > pdfDoc.numPages) continue;

      if (onProgress) {
        onProgress({ current: i + 1, total: targets.length, pageNum: pNum });
      }

      try {
        const page = await pdfDoc.getPage(pNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        results.push({
          pageNum: pNum,
          base64: dataUrl.split(',')[1]
        });
      } catch (err) {
        console.warn(`Failed to render page ${pNum} to image:`, err);
      }
    }

    return results;
  }
}

window.pdfHandler = new PDFHandler();
