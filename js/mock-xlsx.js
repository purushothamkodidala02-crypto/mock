/* Minimal OOXML workbook writer: UTF-8 inline strings, no formulas or external dependencies. */
class MockXlsx {
  static xml(value) {
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  static column(index) { let name = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
  static build(rows) {
    const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => value === '' || value == null ? '' : `<c r="${this.column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${this.xml(value)}</t></is></c>`).join('')}</row>`).join('');
    return this.zip({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${sheet}</sheetData><autoFilter ref="A1:V${rows.length}"/></worksheet>`
    });
  }
  static zip(files) {
    const encoder = new TextEncoder(), chunks = [], directory = []; let offset = 0;
    const header = (length, values) => { const bytes = new Uint8Array(length), view = new DataView(bytes.buffer); for (const [at, value, size] of values) size === 2 ? view.setUint16(at, value, true) : view.setUint32(at, value, true); return bytes; };
    for (const [path, text] of Object.entries(files)) {
      const name = encoder.encode(path), body = encoder.encode(text); let crc = 0xFFFFFFFF;
      for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0); } crc = (crc ^ 0xFFFFFFFF) >>> 0;
      const local = header(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [12, 33, 2], [14, crc, 4], [18, body.length, 4], [22, body.length, 4], [26, name.length, 2]]);
      const central = header(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [14, 33, 2], [16, crc, 4], [20, body.length, 4], [24, body.length, 4], [28, name.length, 2], [42, offset, 4]]);
      chunks.push(local, name, body); directory.push(central, name); offset += local.length + name.length + body.length;
    }
    const length = directory.reduce((sum, b) => sum + b.length, 0), count = Object.keys(files).length;
    chunks.push(...directory, header(22, [[0, 0x06054b50, 4], [8, count, 2], [10, count, 2], [12, length, 4], [16, offset, 4]]));
    const result = new Uint8Array(chunks.reduce((sum, b) => sum + b.length, 0)); let pos = 0;
    for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.length; } return result;
  }
}
if (typeof module !== 'undefined') module.exports = MockXlsx;
if (typeof window !== 'undefined') window.MockXlsx = MockXlsx;
