/**
 * DOCX Handler - Client-Side Word Document Text Extraction using Mammoth.js
 * Zero API required
 */

class DocxHandler {
  /**
   * Extracts raw text and basic formatting from a .docx File
   * @param {File} file 
   * @returns {Promise<{ text: string, html: string }>}
   */
  async extractText(file) {
    if (!window.mammoth) {
      throw new Error('Mammoth.js library is not loaded. Please ensure internet access for CDN.');
    }

    const arrayBuffer = await file.arrayBuffer();

    // Extract raw text
    const textResult = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    
    // Also extract HTML representation for formatting hints if needed
    const htmlResult = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });

    return {
      text: textResult.value,
      html: htmlResult.value,
      messages: textResult.messages
    };
  }
}

window.docxHandler = new DocxHandler();
