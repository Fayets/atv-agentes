import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/**
 * Convierte la salida en Markdown de un agente a un .docx. Cubre lo que los
 * agentes producen: títulos, párrafos, negritas, listas, tablas y bloques de
 * código. Todo en Poppins; si la máquina no la tiene, Word sustituye.
 */

const FONT = "Poppins";

function runs(text) {
  // **negrita** y `código` dentro de una línea
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: "Menlo" }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT }));
  return out.length ? out : [new TextRun({ text: "", font: FONT })];
}

function heading(text, level) {
  const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  return new Paragraph({
    heading: map[level] || HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: runs(text),
  });
}

function tableFromRows(rows) {
  const cells = rows.map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
  const width = Math.max(...cells.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: cells.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: Array.from({ length: width }, (_, j) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: runs(i === 0 ? `**${r[j] || ""}**` : r[j] || ""),
                }),
              ],
            })
          ),
        })
    ),
  });
}

export function markdownToDocxChildren(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const children = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      i += 1;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i += 1;
      buf.forEach((l) =>
        children.push(
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: l || " ", font: "Menlo", size: 18 })],
          })
        )
      );
      children.push(new Paragraph({ children: [] }));
      continue;
    }

    if (/^\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        if (!/^\|\s*-{2,}/.test(lines[i]) && !/^\|(\s*:?-+:?\s*\|)+\s*$/.test(lines[i])) rows.push(lines[i]);
        i += 1;
      }
      if (rows.length) {
        children.push(tableFromRows(rows));
        children.push(new Paragraph({ children: [] }));
      }
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      children.push(heading(h[2].trim(), h[1].length));
      i += 1;
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(bullet[1]) }));
      i += 1;
      continue;
    }

    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360, hanging: 360 },
          children: [new TextRun({ text: `${numbered[1]}. `, font: FONT }), ...runs(numbered[2])],
        })
      );
      i += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      children.push(new Paragraph({ border: { bottom: { style: "single", size: 6, color: "999999" } }, children: [] }));
      i += 1;
      continue;
    }

    if (!line.trim()) {
      children.push(new Paragraph({ children: [] }));
      i += 1;
      continue;
    }

    // párrafo: junta líneas consecutivas no vacías
    const buf = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*[-*•]\s|\s*\d+[.)]\s|\||```)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    children.push(new Paragraph({ spacing: { after: 120 }, children: runs(buf.join(" ")) }));
  }
  return children;
}

export async function downloadDocx(markdown, { title = "Salida", filename = "salida.docx" } = {}) {
  const doc = new Document({
    creator: "Grounded ATV",
    title,
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: FONT } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: FONT } },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
            spacing: { after: 200 },
            children: [new TextRun({ text: title, font: FONT, bold: true, size: 36 })],
          }),
          ...markdownToDocxChildren(markdown),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
