const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

/**
 * Pratinjau cetak (.pdf) dari naskah BRS. Ini BUKAN pengganti ekspor PDF
 * cetak CMYK dari InDesign (yang tetap jadi tanggung jawab Tim IT setelah
 * merapikan tata letak di .idml) -- melainkan draft cepat berisi seluruh
 * teks & tabel supaya Tim Harga bisa proofing angka & narasi sebelum masuk
 * ke tahap layout, sesuai alur 4-langkah pada frontend ("Lihat hasil"
 * sebelum unduh berkas akhir).
 */

const ORANGE = '#F7931E';
const PURPLE = '#5B3E96';
const DARK = '#2A2A2A';

function buildPreviewPdf({ narrative, tabel1, tabel2, ctx, meta }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    const stream = new PassThrough();
    doc.pipe(stream);
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    // --- Halaman sampul ---
    doc.fillColor(PURPLE).fontSize(11).text('BADAN PUSAT STATISTIK', { continued: false });
    doc.fontSize(9).fillColor(DARK).text((ctx.namaWilayah || '').toUpperCase());
    doc.moveDown(1);
    doc.fillColor(ORANGE).fontSize(20).text('BERITA RESMI STATISTIK', { bold: true });
    doc.fontSize(9).fillColor(DARK).text(meta.nomorBRS || `No. .../.../${meta.brsNomorPrefix || ''}/Th. ...., 1 ${ctx.bulanNow} ${ctx.tahunNow}`);
    doc.moveDown(1.5);
    doc.fillColor(ORANGE).fontSize(24).text('Perkembangan', { bold: true });
    doc.fillColor(ORANGE).fontSize(24).text('Indeks Harga Konsumen', { bold: true });
    doc.fillColor(ORANGE).fontSize(24).text(`${ctx.namaWilayah}`, { bold: true });
    doc.fillColor(ORANGE).fontSize(24).text(`${ctx.bulanNow} ${ctx.tahunNow}`, { bold: true });
    doc.moveDown(1);
    doc.fillColor(DARK).fontSize(11).text(`■ ${narrative.ringkasan.headline}`);

    doc.addPage();
    section(doc, 'Ringkasan');
    bulletPara(doc, narrative.ringkasan.paragraf1);
    bulletPara(doc, narrative.ringkasan.paragraf2);
    bulletPara(doc, narrative.ringkasan.paragraf3);

    doc.addPage();
    section(doc, '1. Indeks Harga Konsumen/Inflasi Menurut Kelompok');
    para(doc, narrative.paragrafPembukaBagian1);
    subheading(doc, 'Tabel 1');
    drawTable1(doc, tabel1);
    para(doc, narrative.komoditasDominanYoY);
    para(doc, narrative.komoditasDominanMtM);
    para(doc, narrative.andilKelompokParagraf);

    for (const s of narrative.subbab) {
      if (doc.y > 680) doc.addPage();
      subheading(doc, `${s.subbab}. ${s.judul}`);
      for (const p of s.paragraf) para(doc, p);
    }

    doc.addPage();
    section(doc, '2. Perbandingan Inflasi Antar Tahun');
    para(doc, narrative.perbandinganAntarTahun);
    subheading(doc, 'Tabel 2');
    drawTable2(doc, tabel2);

    // Nomor halaman
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#999')
        .text(`${i + 1}`, 50, 800, { align: 'center', width: doc.page.width - 100 });
    }

    doc.end();
  });
}

function section(doc, text) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.5);
  doc.fillColor(PURPLE).fontSize(14).text(text, { bold: true });
  doc.moveDown(0.3);
  doc.fillColor(DARK).fontSize(10);
}

function subheading(doc, text) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.4);
  doc.fillColor(ORANGE).fontSize(11).text(text, { bold: true });
  doc.moveDown(0.2);
  doc.fillColor(DARK).fontSize(10);
}

function para(doc, text) {
  if (!text) return;
  if (doc.y > 720) doc.addPage();
  doc.fillColor(DARK).fontSize(9.5).text(text, { align: 'justify' });
  doc.moveDown(0.5);
}

function bulletPara(doc, text) {
  if (!text) return;
  if (doc.y > 720) doc.addPage();
  doc.fillColor(DARK).fontSize(9.5).text(`•  ${text}`, { align: 'justify', indent: 0 });
  doc.moveDown(0.5);
}

function drawTable1(doc, tabel1) {
  const cols = [
    { key: 'label', label: 'Kelompok Pengeluaran', width: 150 },
    { key: 'ihkSekarang', label: 'IHK', width: 55 },
    { key: 'infMoM', label: 'm-to-m', width: 50 },
    { key: 'infYtd', label: 'y-to-d', width: 50 },
    { key: 'infYoy', label: 'y-on-y', width: 50 },
    { key: 'andilMoM', label: 'Andil MoM', width: 55 },
    { key: 'andilYoy', label: 'Andil YoY', width: 55 },
  ];
  drawGenericTable(
    doc,
    cols,
    tabel1.rows.map((r) => ({
      label: r.label,
      ihkSekarang: r.display.ihkSekarang,
      infMoM: r.display.infMoM,
      infYtd: r.display.infYtd,
      infYoy: r.display.infYoy,
      andilMoM: r.display.andilMoM,
      andilYoy: r.display.andilYoy,
    }))
  );
}

function drawTable2(doc, tabel2) {
  const cols = [
    { key: 'label', label: 'Tingkat Inflasi', width: 180 },
    ...tabel2.years.map((y) => ({ key: String(y), label: String(y), width: 60 })),
  ];
  const rows = tabel2.rows.map((r) => {
    const o = { label: r.label };
    tabel2.years.forEach((y, i) => (o[String(y)] = r.display[i]));
    return o;
  });
  drawGenericTable(doc, cols, rows);
}

function drawGenericTable(doc, cols, rows) {
  const startX = 50;
  let y = doc.y + 4;
  const rowH = 18;

  // header
  doc.fontSize(8).fillColor('#fff');
  let x = startX;
  doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowH).fill(ORANGE);
  doc.fillColor('#fff');
  for (const c of cols) {
    doc.text(c.label, x + 3, y + 5, { width: c.width - 6, align: 'center' });
    x += c.width;
  }
  y += rowH;

  doc.fillColor(DARK).fontSize(8);
  for (const [i, row] of rows.entries()) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
    if (i % 2 === 1) {
      doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowH).fill('#FBF3E7');
      doc.fillColor(DARK);
    }
    x = startX;
    for (const c of cols) {
      doc.text(String(row[c.key] ?? '-'), x + 3, y + 5, {
        width: c.width - 6,
        align: c.key === 'label' ? 'left' : 'center',
      });
      x += c.width;
    }
    y += rowH;
  }
  doc.y = y + 8;
}

module.exports = { buildPreviewPdf };
