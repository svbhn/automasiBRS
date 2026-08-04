const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} = require('docx');

/**
 * Menyusun naskah narasi BRS lengkap ke dalam dokumen Word (.docx), siap
 * diperiksa editor Tim Harga sebelum konten di-copy ke template InDesign,
 * atau untuk arsip. Struktur mengikuti urutan BRS asli: judul, poin penting,
 * bagian 1 (umum + subbab 1.1-1.11), Tabel 1, bagian 2 (antar tahun), Tabel 2.
 */

const FONT = 'Calibri';
const ORANGE = 'F7931E';
const PURPLE = '5B3E96';

function heading(text, level = HeadingLevel.HEADING_2, color = PURPLE) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color, font: FONT })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 160 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text: text || '', font: FONT, size: 22 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.header ? { fill: ORANGE, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.CENTER,
        children: [
          new TextRun({
            text: String(text),
            bold: !!opts.header,
            color: opts.header ? 'FFFFFF' : '000000',
            font: FONT,
            size: 18,
          }),
        ],
      }),
    ],
  });
}

function buildTabel1Table(tabel1) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Kelompok Pengeluaran', { header: true, width: 3200, align: AlignmentType.LEFT }),
      cell('IHK', { header: true }),
      cell('Inf. m-to-m', { header: true }),
      cell('Inf. y-to-d', { header: true }),
      cell('Inf. y-on-y', { header: true }),
      cell('Andil m-to-m', { header: true }),
      cell('Andil y-on-y', { header: true }),
    ],
  });

  const rows = tabel1.rows.map(
    (r) =>
      new TableRow({
        children: [
          cell(r.label, { align: AlignmentType.LEFT, width: 3200 }),
          cell(r.display.ihkSekarang),
          cell(r.display.infMoM),
          cell(r.display.infYtd),
          cell(r.display.infYoy),
          cell(r.display.andilMoM),
          cell(r.display.andilYoy),
        ],
      })
  );

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

function buildTabel2Table(tabel2) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Tingkat Inflasi', { header: true, width: 3200, align: AlignmentType.LEFT }),
      ...tabel2.years.map((y) => cell(String(y), { header: true })),
    ],
  });
  const rows = tabel2.rows.map(
    (r) =>
      new TableRow({
        children: [
          cell(r.label, { align: AlignmentType.LEFT, width: 3200 }),
          ...r.display.map((v) => cell(v)),
        ],
      })
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

async function buildNarasiDocx({ narrative, tabel1, tabel2, ctx, meta }) {
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'BERITA RESMI STATISTIK', bold: true, size: 20, color: PURPLE, font: FONT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: meta.nomorBRS || `No. .../${ctx.bulanNowNumeric || ''}/${meta.brsNomorPrefix || ''}/Th. .... , 1 ${ctx.bulanNow} ${ctx.tahunNow}`,
          size: 18,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Perkembangan Indeks Harga Konsumen', bold: true, size: 32, color: ORANGE, font: FONT }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `${ctx.namaWilayah} ${ctx.bulanNow} ${ctx.tahunNow}`,
          bold: true,
          size: 32,
          color: ORANGE,
          font: FONT,
        }),
      ],
    })
  );

  // Poin penting halaman depan
  children.push(bullet(narrative.ringkasan.headline));

  // Halaman 2: ringkasan
  children.push(heading('Ringkasan'));
  children.push(bullet(narrative.ringkasan.paragraf1));
  children.push(bullet(narrative.ringkasan.paragraf2));
  children.push(bullet(narrative.ringkasan.paragraf3));

  // Bagian 1
  children.push(heading('1. Indeks Harga Konsumen/Inflasi Menurut Kelompok'));
  children.push(body(narrative.paragrafPembukaBagian1));
  children.push(heading('Tabel 1', HeadingLevel.HEADING_3, ORANGE));
  children.push(buildTabel1Table(tabel1));
  children.push(
    ...tabel1.keterangan.map(
      (k) =>
        new Paragraph({
          spacing: { before: 40 },
          children: [new TextRun({ text: k, italics: true, size: 16, font: FONT })],
        })
    )
  );
  children.push(body(narrative.komoditasDominanYoY));
  children.push(body(narrative.komoditasDominanMtM));
  children.push(body(narrative.andilKelompokParagraf));

  // Subbab 1.1 - 1.11
  for (const s of narrative.subbab) {
    children.push(heading(`${s.subbab}. ${s.judul}`, HeadingLevel.HEADING_3, ORANGE));
    for (const p of s.paragraf) children.push(body(p));
  }

  // Bagian 2
  children.push(heading('2. Perbandingan Inflasi Antar Tahun'));
  children.push(body(narrative.perbandinganAntarTahun));
  children.push(heading('Tabel 2', HeadingLevel.HEADING_3, ORANGE));
  children.push(buildTabel2Table(tabel2));

  const doc = new Document({
    creator: 'Otomasi BRS - BPS Provinsi Papua',
    title: `BRS IHK ${ctx.namaWilayah} ${ctx.bulanNow} ${ctx.tahunNow}`,
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildNarasiDocx };
