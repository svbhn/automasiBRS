const ExcelJS = require('exceljs');
const { KELOMPOK, UMUM_KODE } = require('../config/kelompok');

/**
 * Parser Excel BRS IHK.
 *
 * Mendukung DUA bentuk file yang disebut dalam notulen rapat:
 *  1) "Sudah ada pivot table"  -> punya sheet Pivot/Kelompok/Subkelompok siap pakai
 *     (contoh: 1__9400_Template_Olah_Juni_2026.xlsx)
 *  2) "Belum ada pivot table"  -> hanya sheet DATASET mentah baris-per-baris,
 *     backend melakukan agregasi sendiri (setara membuat pivot table)
 *     (contoh: 2__9500_Template_Olah_Juni_2026_dataset.xlsx)
 *
 * Kode pada kolom "Kode"/"Kelompok" DATASET:
 *   1 digit ("0")      -> UMUM (headline)
 *   2 digit ("01".."11") -> Kelompok pengeluaran
 *   3 digit            -> Subkelompok
 *   7 digit            -> Komoditas/item individual
 */

const SHEET_NAMES = {
  PIVOT: 'Pivot',
  KELOMPOK: 'Kelompok',
  SUBKELOMPOK: 'Subkelompok',
  DATASET: 'DATASET',
};

/**
 * Alias nama kolom yang pernah ditemukan pada berbagai varian file "dataset
 * mentah" BPS (nama sheet & nama kolom TIDAK selalu konsisten antar rilisan
 * -- contoh nyata: file "9400...xlsx" memakai sheet "DATASET" dengan kolom
 * "Kd.Kota"/"INF(MOM)", sedangkan file "9700_06_Bahan_Rilis_Inflasi..."
 * memakai sheet "Sheet1" dengan kolom "Kode Kota"/"Inflasi MtM"). Parser
 * mencocokkan header secara case/format-insensitive lewat alias di bawah,
 * BUKAN lewat nama sheet, supaya tahan terhadap variasi penamaan seperti ini.
 */
const COLUMN_ALIASES = {
  tahun: ['tahun'],
  bulan: ['bulan'],
  kdKota: ['kdkota', 'kodekota', 'kdkot'],
  namaKota: ['namakota'],
  kode: ['kode', 'kodekomoditas', 'kodebarang', 'kodeitem'],
  nama: ['nama', 'namakomoditas', 'namabarang', 'namaitem'],
  flag: ['flag'],
  nk: ['nk'],
  ihk: ['ihk'],
  infMoM: ['infmom', 'inflasimtm', 'inflasimtom', 'inflasibulanan'],
  infYtd: ['inytd', 'infytd', 'inflasiytd', 'inflasiytod', 'inflasitahunkalender'],
  infYoy: ['infyoy', 'inflasiyoy', 'inflasiytoy', 'inflasitahunan'],
  andilMoM: ['andilmom', 'andilmtm', 'andilmtom'],
  andilYtd: ['andilytd', 'andilytod'],
  andilYoy: ['andilyoy', 'andilytoy'],
  urutan: ['urutan'],
};

function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cari baris header pada sebuah sheet dengan memindai `maxScanRows` baris
 * pertama, mencocokkan tiap cell terhadap COLUMN_ALIASES. Baris dengan
 * jumlah kolom wajib (tahun/bulan/ihk/kode/nama + minimal salah satu
 * inflasi) yang cocok terbanyak dianggap baris header.
 */
function findHeaderRowAndColumns(ws, maxScanRows = 15) {
  const REQUIRED = ['tahun', 'bulan', 'ihk', 'kode', 'nama'];
  let best = null;

  for (let r = 1; r <= Math.min(maxScanRows, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const colIndex = {};
    let matchCount = 0;

    for (let c = 1; c <= Math.max(ws.columnCount, 20); c++) {
      const raw = row.getCell(c).value;
      if (raw === null || raw === undefined || raw === '') continue;
      const norm = normalizeHeader(typeof raw === 'object' ? raw.text || raw.result : raw);
      for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (colIndex[canonical]) continue; // kolom ini sudah ketemu di baris ini
        if (aliases.includes(norm)) {
          colIndex[canonical] = c;
          matchCount++;
          break;
        }
      }
    }

    const hasRequired = REQUIRED.every((key) => colIndex[key]);
    if (hasRequired && (!best || matchCount > best.matchCount)) {
      best = { headerRow: r, colIndex, matchCount };
    }
  }

  return best; // null jika tidak ditemukan baris header yang valid
}

/**
 * Cari sheet mana pun dalam workbook yang mengandung baris header dataset
 * mentah yang valid (tidak bergantung pada nama sheet). Mengembalikan
 * { sheetName, headerRow, colIndex } atau null bila tidak ada satupun sheet
 * yang cocok.
 */
function findDatasetSheet(wb) {
  for (const ws of wb.worksheets) {
    const found = findHeaderRowAndColumns(ws);
    if (found) {
      return { sheetName: ws.name, worksheet: ws, ...found };
    }
  }
  return null;
}

async function loadWorkbook(filePathOrBuffer) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(filePathOrBuffer)) {
    await wb.xlsx.load(filePathOrBuffer);
  } else {
    await wb.xlsx.readFile(filePathOrBuffer);
  }
  return wb;
}

function sheetExists(wb, name) {
  return !!wb.getWorksheet(name);
}

function cellNum(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && v.result !== undefined) return Number(v.result); // formula cell
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function cellStr(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v.text !== undefined) return String(v.text).trim();
  return String(v).trim();
}

/**
 * Mendeteksi format file: 'pivot' jika sheet Pivot/Kelompok/Subkelompok ada,
 * 'dataset' jika ADA SHEET APA PUN (nama bebas) yang headernya cocok dengan
 * pola dataset mentah (lihat findDatasetSheet), selain itu 'unknown'.
 */
function detectFormat(wb) {
  const hasPivotSheets =
    sheetExists(wb, SHEET_NAMES.KELOMPOK) && sheetExists(wb, SHEET_NAMES.SUBKELOMPOK);
  if (hasPivotSheets) return { format: 'pivot' };

  const dataset = findDatasetSheet(wb);
  if (dataset) return { format: 'dataset', ...dataset };

  return { format: 'unknown' };
}

/* ------------------------------------------------------------------ */
/* Bentuk 1: sheet "Kelompok" & "Subkelompok" sudah berupa pivot table */
/* ------------------------------------------------------------------ */

function parseKelompokSheet(wb) {
  const ws = wb.getWorksheet(SHEET_NAMES.KELOMPOK);
  if (!ws) return { umum: null, kelompok: [] };

  // Cari baris header "Row Labels" secara dinamis (posisi bisa bergeser antar
  // versi template), lalu baca baris-baris di bawahnya sampai kosong.
  let headerRow = null;
  ws.eachRow((row, rowNumber) => {
    if (headerRow) return;
    if (cellStr(row, 1) === 'Row Labels') headerRow = rowNumber;
  });
  if (!headerRow) return { umum: null, kelompok: [] };

  let umum = null;
  const kelompok = [];

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellStr(row, 1);
    if (!label) break;

    const rec = {
      labelUpper: label,
      ihk: cellNum(row, 2),
      infMoM: cellNum(row, 3),
      infYtd: cellNum(row, 4),
      infYoy: cellNum(row, 5),
      andilMoM: cellNum(row, 6),
      andilYoy: cellNum(row, 7),
    };

    if (label === 'UMUM') {
      umum = rec;
      continue;
    }

    const cfg = KELOMPOK.find((k) => k.labelUpper === label);
    kelompok.push({ ...rec, kode: cfg ? cfg.kode : null, cfg: cfg || null });
  }

  return { umum, kelompok };
}

function parseSubkelompokSheet(wb) {
  const ws = wb.getWorksheet(SHEET_NAMES.SUBKELOMPOK);
  if (!ws) return [];

  let headerRow = null;
  ws.eachRow((row, rowNumber) => {
    if (headerRow) return;
    if (cellStr(row, 1) === 'Row Labels') headerRow = rowNumber;
  });
  if (!headerRow) return [];

  const items = [];
  let currentKelompokUpper = null;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellStr(row, 1);
    if (!label) continue;

    const isKelompokRow = KELOMPOK.some((k) => k.labelUpper === label);
    if (isKelompokRow) {
      currentKelompokUpper = label;
      continue; // baris kelompok sendiri sudah ditangani parseKelompokSheet
    }

    items.push({
      kelompokUpper: currentKelompokUpper,
      nama: label,
      ihk: cellNum(row, 2),
      infMoM: cellNum(row, 3),
      infYtd: cellNum(row, 4),
      infYoy: cellNum(row, 5),
      andilMoM: cellNum(row, 6),
      andilYoy: cellNum(row, 7),
      urutan: cellNum(row, 8),
    });
  }

  return items;
}

/**
 * Sheet "Pivot" berisi Top-N komoditas dominan andil inflasi/deflasi
 * untuk MoM dan YoY, dalam 4 blok kolom (A-B, D-E, G-H, J-K).
 */
function parsePivotSheet(wb) {
  const ws = wb.getWorksheet(SHEET_NAMES.PIVOT);
  const empty = {
    andilInflasiMoM: [],
    andilDeflasiMoM: [],
    andilInflasiYoY: [],
    andilDeflasiYoY: [],
  };
  if (!ws) return empty;

  const blocks = [
    { key: 'andilInflasiMoM', labelCol: 1, valueCol: 2 },
    { key: 'andilDeflasiMoM', labelCol: 4, valueCol: 5 },
    { key: 'andilInflasiYoY', labelCol: 7, valueCol: 8 },
    { key: 'andilDeflasiYoY', labelCol: 10, valueCol: 11 },
  ];

  const result = { andilInflasiMoM: [], andilDeflasiMoM: [], andilInflasiYoY: [], andilDeflasiYoY: [] };

  // Baris "Row Labels" untuk tiap blok bisa berada di baris berbeda
  // (blok deflasi YoY biasanya mulai lebih ke bawah karena diberi judul
  // tambahan). Cari baris "Row Labels" per kolom label.
  for (const block of blocks) {
    let headerRow = null;
    ws.eachRow((row, rowNumber) => {
      if (headerRow) return;
      if (cellStr(row, block.labelCol) === 'Row Labels') headerRow = rowNumber;
    });
    if (!headerRow) continue;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nama = cellStr(row, block.labelCol);
      const nilai = cellNum(row, block.valueCol);
      if (!nama || nilai === null) continue;
      // hentikan bila bertemu header blok lain di kolom yang sama
      if (nama === 'Row Labels') break;
      result[block.key].push({ nama: titleCaseKomoditas(nama), andil: nilai });
    }
  }

  return result;
}

function titleCaseKomoditas(nama) {
  return String(nama)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bDan\b/g, 'dan')
    .replace(/\/\s*/g, '/');
}

/* ------------------------------------------------------------------ */
/* Bentuk 2: sheet "DATASET" mentah -> backend membangun pivot sendiri */
/* ------------------------------------------------------------------ */

function parseDatasetSheet(wb, discovered) {
  const found = discovered || findDatasetSheet(wb);
  if (!found) {
    throw new Error(
      'Tidak ditemukan sheet berformat dataset mentah pada file ini (dicoba mencocokkan header ' +
        'kolom Tahun/Bulan/Kode/Nama/IHK di semua sheet, apapun nama sheet & kolomnya).'
    );
  }
  const { worksheet: ws, headerRow, colIndex } = found;

  const requiredCanonical = ['kode', 'nama', 'ihk'];
  for (const key of requiredCanonical) {
    if (!colIndex[key]) {
      throw new Error(`Kolom untuk "${key}" tidak ditemukan pada sheet "${found.sheetName}".`);
    }
  }
  // Minimal salah satu kolom inflasi/andil harus ada supaya narasi bisa disusun.
  const hasAnyMetric = ['infMoM', 'infYtd', 'infYoy', 'andilMoM', 'andilYoy'].some((k) => colIndex[k]);
  if (!hasAnyMetric) {
    throw new Error(
      `Sheet "${found.sheetName}" ditemukan tapi tidak ada satupun kolom inflasi/andil yang cocok ` +
        '(dicoba: INF(MOM)/Inflasi MtM, INF(YOY)/Inflasi YoY, ANDIL(MOM)/Andil MtM, dst).'
    );
  }

  const get = (row, key) => (colIndex[key] ? cellNum(row, colIndex[key]) : null);
  const getStr = (row, key) => (colIndex[key] ? cellStr(row, colIndex[key]) : null);

  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const kode = getStr(row, 'kode');
    if (!kode) continue;
    rows.push({
      kode,
      nama: getStr(row, 'nama'),
      ihk: get(row, 'ihk'),
      infMoM: get(row, 'infMoM'),
      infYtd: get(row, 'infYtd'),
      infYoy: get(row, 'infYoy'),
      andilMoM: get(row, 'andilMoM'),
      andilYoy: get(row, 'andilYoy'),
      urutan: get(row, 'urutan'),
      tahun: getStr(row, 'tahun'),
      bulan: getStr(row, 'bulan'),
      kdKota: getStr(row, 'kdKota'),
      namaKota: getStr(row, 'namaKota'),
    });
  }

  if (rows.length === 0) {
    throw new Error(`Sheet "${found.sheetName}" ditemukan tapi tidak ada baris data di bawah header.`);
  }

  const umumRow = rows.find((r) => r.kode.length === 1);
  const kelompokRows = rows.filter((r) => r.kode.length === 2);
  const subkelompokRows = rows.filter((r) => r.kode.length === 3);
  const komoditasRows = rows.filter((r) => r.kode.length === 7);

  const umum = umumRow
    ? {
        ihk: umumRow.ihk,
        infMoM: umumRow.infMoM,
        infYtd: umumRow.infYtd,
        infYoy: umumRow.infYoy,
        andilMoM: umumRow.andilMoM,
        andilYoy: umumRow.andilYoy,
      }
    : null;

  const kelompok = kelompokRows.map((r) => {
    const cfg = KELOMPOK.find((k) => k.kode === r.kode);
    return {
      kode: r.kode,
      labelUpper: cfg ? cfg.labelUpper : r.nama,
      ihk: r.ihk,
      infMoM: r.infMoM,
      infYtd: r.infYtd,
      infYoy: r.infYoy,
      andilMoM: r.andilMoM,
      andilYoy: r.andilYoy,
      cfg: cfg || null,
    };
  });

  const subkelompok = subkelompokRows.map((r) => ({
    kelompokKode: r.kode.slice(0, 2),
    nama: titleCaseKomoditas(r.nama),
    ihk: r.ihk,
    infMoM: r.infMoM,
    infYtd: r.infYtd,
    infYoy: r.infYoy,
    andilMoM: r.andilMoM,
    andilYoy: r.andilYoy,
    urutan: r.urutan,
  }));

  // Bangun "pivot" top komoditas dari baris 7-digit, meniru filter Top-N
  // Excel (Flag=3 pada template asli). Kita ambil semua nilai signifikan
  // (bukan nol) lalu urutkan menurun/menaik seperti pivot table asli.
  const komodByAndilMoMDesc = [...komoditasRows]
    .filter((r) => r.andilMoM !== null && r.andilMoM > 0.0005)
    .sort((a, b) => b.andilMoM - a.andilMoM);
  const komodByAndilMoMAsc = [...komoditasRows]
    .filter((r) => r.andilMoM !== null && r.andilMoM < -0.0005)
    .sort((a, b) => a.andilMoM - b.andilMoM);
  const komodByAndilYoYDesc = [...komoditasRows]
    .filter((r) => r.andilYoy !== null && r.andilYoy > 0.0005)
    .sort((a, b) => b.andilYoy - a.andilYoy);
  const komodByAndilYoYAsc = [...komoditasRows]
    .filter((r) => r.andilYoy !== null && r.andilYoy < -0.0005)
    .sort((a, b) => a.andilYoy - b.andilYoy);

  const pivot = {
    andilInflasiMoM: komodByAndilMoMDesc.map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilMoM })),
    andilDeflasiMoM: komodByAndilMoMAsc.map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilMoM })),
    andilInflasiYoY: komodByAndilYoYDesc.map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilYoy })),
    andilDeflasiYoY: komodByAndilYoYAsc.map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilYoy })),
  };

  // Karena baris komoditas (kode 7 digit) pada DATASET mentah bisa ditelusuri
  // ke kelompoknya lewat 2 digit awal kode, kita bisa menyusun rincian
  // komoditas dominan PER KELOMPOK (dipakai narasi subbab 1.1-1.11).
  // Ini tidak mungkin dilakukan dari file yang "sudah dipivot" karena sheet
  // Pivot hanya menyimpan daftar Top-N global, tanpa keterkaitan ke kelompok.
  const komoditasByKelompok = {};
  for (const cfg of KELOMPOK) {
    const rowsForKelompok = komoditasRows.filter((r) => r.kode.slice(0, 2) === cfg.kode);
    komoditasByKelompok[cfg.kode] = {
      andilInflasiYoY: rowsForKelompok
        .filter((r) => r.andilYoy !== null && r.andilYoy > 0.0005)
        .sort((a, b) => b.andilYoy - a.andilYoy)
        .map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilYoy })),
      andilDeflasiYoY: rowsForKelompok
        .filter((r) => r.andilYoy !== null && r.andilYoy < -0.0005)
        .sort((a, b) => a.andilYoy - b.andilYoy)
        .map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilYoy })),
      andilInflasiMoM: rowsForKelompok
        .filter((r) => r.andilMoM !== null && r.andilMoM > 0.0005)
        .sort((a, b) => b.andilMoM - a.andilMoM)
        .map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilMoM })),
      andilDeflasiMoM: rowsForKelompok
        .filter((r) => r.andilMoM !== null && r.andilMoM < -0.0005)
        .sort((a, b) => a.andilMoM - b.andilMoM)
        .map((r) => ({ nama: titleCaseKomoditas(r.nama), andil: r.andilMoM })),
    };
  }

  const meta = {
    tahun: umumRow ? umumRow.tahun : null,
    bulan: umumRow ? umumRow.bulan : null,
    kodeWilayah: umumRow ? umumRow.kdKota : null,
    namaKota: umumRow ? umumRow.namaKota : null,
  };

  return { umum, kelompok, subkelompok, pivot, komoditasByKelompok, meta };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

async function parseBRSWorkbook(filePathOrBuffer, originalFilename = '') {
  const wb = await loadWorkbook(filePathOrBuffer);
  const detected = detectFormat(wb);
  const format = detected.format;

  if (format === 'unknown') {
    throw new Error(
      'Format file tidak dikenali. Diperlukan salah satu dari: (1) sheet "Kelompok" + "Subkelompok" ' +
        '(sudah dipivot), atau (2) sheet apa pun (nama bebas) yang berisi data mentah per baris dengan ' +
        'kolom setara Tahun, Bulan, Kode/Kode Komoditas, Nama/Nama Komoditas, IHK, dan minimal satu ' +
        'kolom inflasi/andil (mis. INF(MOM)/Inflasi MtM, INF(YOY)/Inflasi YoY). ' +
        `Sheet yang ditemukan pada file ini: ${wb.worksheets.map((w) => `"${w.name}"`).join(', ')}.`
    );
  }

  let umum, kelompok, subkelompok, pivot, meta, komoditasByKelompok = null;

  if (format === 'pivot') {
    const k = parseKelompokSheet(wb);
    umum = k.umum;
    kelompok = k.kelompok;
    subkelompok = parseSubkelompokSheet(wb);
    pivot = parsePivotSheet(wb);
    meta = extractMetaFromFilename(originalFilename);
  } else {
    const d = parseDatasetSheet(wb, detected);
    umum = d.umum;
    kelompok = d.kelompok;
    subkelompok = d.subkelompok;
    pivot = d.pivot;
    komoditasByKelompok = d.komoditasByKelompok;
    meta = { ...extractMetaFromFilename(originalFilename), ...d.meta, sheetTerbaca: detected.sheetName };
  }

  if (!umum) {
    throw new Error('Baris UMUM (headline) tidak ditemukan pada file. Periksa kembali struktur file.');
  }
  if (kelompok.length === 0) {
    throw new Error('Tidak ada baris kelompok pengeluaran yang terbaca dari file.');
  }

  // Lengkapi tiap kelompok dengan subkelompoknya masing-masing.
  for (const k of kelompok) {
    const label = k.cfg ? k.cfg.labelUpper : k.labelUpper;
    k.subkelompok = subkelompok.filter(
      (s) => s.kelompokKode === k.kode || s.kelompokUpper === label
    );
  }

  return {
    format,
    sheetNamesFound: wb.worksheets.map((w) => w.name),
    meta,
    umum,
    kelompok: kelompok.sort((a, b) => (a.kode || '').localeCompare(b.kode || '')),
    pivot,
    komoditasByKelompok, // null jika format 'pivot' (tidak tersedia di sumbernya)
  };
}

function extractMetaFromFilename(filename) {
  const m = String(filename).match(/(\d{4})[_\-]?(9\d{3})|(9\d{3}).*?(20\d{2})/i);
  const kodeMatch = String(filename).match(/9[0-9]00/);
  return {
    kodeWilayahFromFilename: kodeMatch ? kodeMatch[0] : null,
  };
}

module.exports = {
  parseBRSWorkbook,
  detectFormat,
  loadWorkbook,
};
