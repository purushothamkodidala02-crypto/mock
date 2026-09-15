/**
 * Exporter Engine - Multi-Format Client-Side File Generation & Download
 * Zero API - 100% In-Browser
 */

class ExporterEngine {
  /**
   * Triggers a browser file download with given text content
   */
  downloadFile(content, fileName, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export to Structured JSON
   */
  exportJSON(examData) {
    const jsonStr = JSON.stringify(examData, null, 2);
    const filename = `${this.slugify(examData.metadata.subject || 'question_paper')}_extracted.json`;
    this.downloadFile(jsonStr, filename, 'application/json');
  }

  /**
   * Export to CSV Format
   */
  exportCSV(examData) {
    const rows = [
      ['Question Number', 'Section', 'Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Marks']
    ];

    (examData.sections || []).forEach(sec => {
      (sec.questions || []).forEach(q => {
        const optA = q.options?.find(o => o.key === 'A' || o.key === '1')?.text || q.options?.[0]?.text || '';
        const optB = q.options?.find(o => o.key === 'B' || o.key === '2')?.text || q.options?.[1]?.text || '';
        const optC = q.options?.find(o => o.key === 'C' || o.key === '3')?.text || q.options?.[2]?.text || '';
        const optD = q.options?.find(o => o.key === 'D' || o.key === '4')?.text || q.options?.[3]?.text || '';

        rows.push([
          q.questionNumber || '',
          sec.title || '',
          q.type || '',
          `"${(q.questionText || '').replace(/"/g, '""')}"`,
          `"${optA.replace(/"/g, '""')}"`,
          `"${optB.replace(/"/g, '""')}"`,
          `"${optC.replace(/"/g, '""')}"`,
          `"${optD.replace(/"/g, '""')}"`,
          q.correctAnswer || '',
          q.marks || 1
        ]);
      });
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const filename = `${this.slugify(examData.metadata.subject || 'question_paper')}_questions.csv`;
    this.downloadFile(csvContent, filename, 'text/csv');
  }

  /**
   * Export to Markdown Format
   */
  exportMarkdown(examData) {
    const meta = examData.metadata || {};
    let md = '';

    md += `# ${meta.title || 'Question Paper'}\n\n`;
    if (meta.institution) md += `**Institution:** ${meta.institution}\n\n`;
    md += `**Subject:** ${meta.subject || 'General'} | **Grade:** ${meta.grade || 'N/A'} | **Max Marks:** ${meta.maxMarks || 'N/A'} | **Duration:** ${meta.duration || 'N/A'}\n\n`;

    if (meta.instructions && meta.instructions.length > 0) {
      md += `### General Instructions:\n`;
      meta.instructions.forEach((inst, idx) => {
        md += `${idx + 1}. ${inst}\n`;
      });
      md += `\n---\n\n`;
    }

    (examData.sections || []).forEach(sec => {
      md += `## ${sec.title}\n`;
      if (sec.description) md += `*${sec.description}*\n\n`;

      (sec.questions || []).forEach(q => {
        md += `#### Q${q.questionNumber}. ${q.questionText} \`[${q.marks || 1} Marks]\`\n\n`;

        if (q.image) {
          md += `![Question ${q.questionNumber} Diagram](${q.image})\n\n`;
        }

        if (q.options && q.options.length > 0) {
          q.options.forEach(opt => {
            const isCorrect = q.correctAnswer === opt.key ? ' ✓ *(Correct)*' : '';
            md += `- **(${opt.key})** ${opt.text}${isCorrect}\n`;
          });
          md += `\n`;
        }

        if (q.subQuestions && q.subQuestions.length > 0) {
          q.subQuestions.forEach(sq => {
            md += `  - **(${sq.label})** ${sq.text} *[${sq.marks || 1}M]*\n`;
          });
          md += `\n`;
        }

        if (q.hasOrChoice) {
          md += `> **[OR]**\n\n`;
        }
      });

      md += `\n`;
    });

    const filename = `${this.slugify(meta.subject || 'question_paper')}.md`;
    this.downloadFile(md, filename, 'text/markdown');
  }

  /**
   * Export to LaTeX (exam documentclass)
   */
  exportLaTeX(examData) {
    const meta = examData.metadata || {};
    let tex = '';

    tex += `\\documentclass[12pt,a4paper]{exam}\n`;
    tex += `\\usepackage[utf8]{inputenc}\n`;
    tex += `\\usepackage{amsmath,amssymb}\n`;
    tex += `\\usepackage{geometry}\n`;
    tex += `\\geometry{margin=1in}\n\n`;
    tex += `\\pagestyle{headandfoot}\n`;
    tex += `\\firstpageheader{${meta.subject || 'Exam'}}{${meta.title || 'Question Paper'}}{Marks: ${meta.maxMarks || 100}}\n`;
    tex += `\\runningheader{${meta.subject || 'Exam'}}{}{Page \\thepage\\ of \\numpages}\n`;
    tex += `\\firstpagefooter{}{}{}\n\n`;
    tex += `\\begin{document}\n\n`;
    tex += `\\begin{center}\n`;
    tex += `  {\\Large\\bfseries ${meta.institution || 'EXAMINATION'}}\\\\[4pt]\n`;
    tex += `  {\\large ${meta.title || 'Annual Examination'}}\\\\[4pt]\n`;
    tex += `  \\textbf{Subject: ${meta.subject || ''}} \\quad \\textbf{Class: ${meta.grade || ''}} \\quad \\textbf{Time: ${meta.duration || ''}}\n`;
    tex += `\\end{center}\n\\vspace{10pt}\n\\hrule\\vspace{10pt}\n\n`;

    if (meta.instructions && meta.instructions.length > 0) {
      tex += `\\noindent\\textbf{General Instructions:}\n\\begin{enumerate}\n`;
      meta.instructions.forEach(inst => {
        tex += `  \\item ${this.escapeLaTeX(inst)}\n`;
      });
      tex += `\\end{enumerate}\n\\vspace{10pt}\n\n`;
    }

    (examData.sections || []).forEach(sec => {
      tex += `\\section*{${sec.title}${sec.description ? ' - ' + this.escapeLaTeX(sec.description) : ''}}\n\n`;
      tex += `\\begin{questions}\n`;

      (sec.questions || []).forEach(q => {
        tex += `\\question[${q.marks || 1}] ${this.escapeLaTeX(q.questionText)}\n`;

        if (q.options && q.options.length > 0) {
          tex += `\\begin{choices}\n`;
          q.options.forEach(opt => {
            const isCorrect = q.correctAnswer === opt.key ? '\\CorrectChoice' : '\\choice';
            tex += `  ${isCorrect} ${this.escapeLaTeX(opt.text)}\n`;
          });
          tex += `\\end{choices}\n`;
        }

        if (q.subQuestions && q.subQuestions.length > 0) {
          tex += `\\begin{parts}\n`;
          q.subQuestions.forEach(sq => {
            tex += `  \\part[${sq.marks || 1}] ${this.escapeLaTeX(sq.text)}\n`;
          });
          tex += `\\end{parts}\n`;
        }

        if (q.hasOrChoice) {
          tex += `\\begin{center}\\textbf{--- OR ---}\\end{center}\n`;
        }
      });

      tex += `\\end{questions}\n\\vspace{15pt}\n\n`;
    });

    tex += `\\end{document}\n`;

    const filename = `${this.slugify(meta.subject || 'question_paper')}.tex`;
    this.downloadFile(tex, filename, 'text/x-tex');
  }

  /**
   * Export to Word Document (.doc)
   */
  exportWordDoc(examData) {
    const meta = examData.metadata || {};
    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${meta.title || 'Question Paper'}</title>
<style>
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.4; }
  h1 { text-align: center; font-size: 18pt; margin-bottom: 4px; }
  h2 { font-size: 14pt; color: #1e3a8a; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
  .header-box { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
  .meta-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px; }
  .question-item { margin-bottom: 14px; page-break-inside: avoid; }
  .q-title { font-weight: bold; }
  .marks { float: right; font-weight: bold; }
  .options-grid { margin-left: 20px; margin-top: 4px; }
  .option-item { margin-bottom: 3px; }
  .instructions { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 8px 12px; margin-bottom: 15px; }
</style>
</head>
<body>
  <div class="header-box">
    <h1>${meta.institution || 'EXAMINATION PAPER'}</h1>
    <h3>${meta.title || 'Question Paper'}</h3>
    <div><strong>Subject:</strong> ${meta.subject || ''} | <strong>Class:</strong> ${meta.grade || ''} | <strong>Time:</strong> ${meta.duration || ''} | <strong>Max Marks:</strong> ${meta.maxMarks || ''}</div>
  </div>`;

    if (meta.instructions && meta.instructions.length > 0) {
      html += `<div class="instructions"><strong>General Instructions:</strong><ol>`;
      meta.instructions.forEach(inst => {
        html += `<li>${inst}</li>`;
      });
      html += `</ol></div>`;
    }

    (examData.sections || []).forEach(sec => {
      html += `<h2>${sec.title}${sec.description ? ' - ' + sec.description : ''}</h2>`;
      (sec.questions || []).forEach(q => {
        html += `<div class="question-item">
          <span class="q-title">Q${q.questionNumber}. ${q.questionText}</span>
          <span class="marks">[${q.marks || 1} Mark${(q.marks > 1 ? 's' : '')}]</span>`;

        if (q.image) {
          html += `<div style="margin: 8px 0;"><img src="${q.image}" style="max-height: 250px; max-width: 100%; border: 1px solid #ddd; padding: 4px;" /></div>`;
        }

        if (q.options && q.options.length > 0) {
          html += `<div class="options-grid">`;
          q.options.forEach(opt => {
            html += `<div class="option-item"><strong>(${opt.key})</strong> ${opt.text}</div>`;
          });
          html += `</div>`;
        }

        if (q.subQuestions && q.subQuestions.length > 0) {
          html += `<div style="margin-left: 20px; margin-top: 4px;">`;
          q.subQuestions.forEach(sq => {
            html += `<div><strong>(${sq.label})</strong> ${sq.text} <em>[${sq.marks || 1}M]</em></div>`;
          });
          html += `</div>`;
        }

        if (q.hasOrChoice) {
          html += `<div style="text-align: center; font-weight: bold; margin: 8px 0;">--- OR ---</div>`;
        }

        html += `</div>`;
      });
    });

    html += `</body></html>`;

    const filename = `${this.slugify(meta.subject || 'question_paper')}.doc`;
    this.downloadFile(html, filename, 'application/msword');
  }

  /**
   * Export to Quizizz / Kahoot / Google Forms spreadsheet format
   */
  exportQuizFormat(examData) {
    const rows = [
      ['Question Text', 'Question Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer', 'Time in seconds', 'Points']
    ];

    (examData.questions || []).forEach(q => {
      const opt1 = q.options?.[0]?.text || '';
      const opt2 = q.options?.[1]?.text || '';
      const opt3 = q.options?.[2]?.text || '';
      const opt4 = q.options?.[3]?.text || '';

      // Determine correct answer index or text
      let correctCol = '1';
      if (q.correctAnswer) {
        if (q.correctAnswer === 'B' || q.correctAnswer === '2') correctCol = '2';
        else if (q.correctAnswer === 'C' || q.correctAnswer === '3') correctCol = '3';
        else if (q.correctAnswer === 'D' || q.correctAnswer === '4') correctCol = '4';
      }

      rows.push([
        `"${(q.questionText || '').replace(/"/g, '""')}"`,
        q.type === 'mcq' ? 'Multiple Choice' : 'Open-Ended',
        `"${opt1.replace(/"/g, '""')}"`,
        `"${opt2.replace(/"/g, '""')}"`,
        `"${opt3.replace(/"/g, '""')}"`,
        `"${opt4.replace(/"/g, '""')}"`,
        correctCol,
        '60',
        q.marks || 1
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const filename = `${this.slugify(examData.metadata.subject || 'quiz')}_quizizz_googleforms.csv`;
    this.downloadFile(csvContent, filename, 'text/csv');
  }

  escapeLaTeX(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%$#_{}])/g, '\\$1')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '_');
  }
}

window.exporterEngine = new ExporterEngine();
