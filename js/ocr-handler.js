/**
 * OCR Handler - In-Browser Optical Character Recognition for Scanned Images
 * Powered by Tesseract.js (Zero API - Runs client-side in Web Workers)
 */

class OCRHandler {
  constructor() {
    this.worker = null;
    this.isInitializing = false;
  }

  /**
   * Initializes Tesseract worker if not already initialized
   */
  async initWorker(language = 'eng', onStatus = null) {
    if (this.worker) return this.worker;

    if (!window.Tesseract) {
      throw new Error('Tesseract.js is not loaded. Please ensure internet connectivity for CDN.');
    }

    if (onStatus) onStatus('Initializing OCR engine...');

    const { createWorker } = window.Tesseract;
    this.worker = await createWorker(language, 1, {
      logger: m => {
        if (onStatus && m.status === 'recognizing text') {
          onStatus(`OCR Processing: ${Math.round((m.progress || 0) * 100)}%`);
        }
      }
    });

    return this.worker;
  }

  /**
   * Recognizes text from image file, blob, or image URL
   * @param {File|Blob|string} imageSource 
   * @param {Object} options 
   * @returns {Promise<{ text: string, confidence: number }>}
   */
  async recognize(imageSource, options = {}) {
    const { language = 'eng', onProgress = null } = options;

    await this.initWorker(language, statusText => {
      if (onProgress) onProgress({ status: statusText });
    });

    if (onProgress) onProgress({ status: 'Recognizing text from image...' });

    const ret = await this.worker.recognize(imageSource);
    
    return {
      text: ret.data.text,
      confidence: ret.data.confidence,
      lines: ret.data.lines ? ret.data.lines.map(l => l.text) : []
    };
  }

  /**
   * Batch process multiple images
   */
  async recognizeMultiple(imageFiles, onProgress = null) {
    const results = [];
    const total = imageFiles.length;

    for (let i = 0; i < total; i++) {
      const file = imageFiles[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          status: `Processing image ${i + 1} of ${total}...`
        });
      }

      const res = await this.recognize(file);
      results.push({
        filename: file.name || `Image_${i + 1}`,
        text: res.text,
        confidence: res.confidence
      });
    }

    const combinedText = results.map((r, idx) => `--- PAGE ${idx + 1} (${r.filename}) ---\n${r.text}`).join('\n\n');

    return {
      text: combinedText,
      results: results
    };
  }

  /**
   * Terminates the worker to free memory
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

window.ocrHandler = new OCRHandler();
