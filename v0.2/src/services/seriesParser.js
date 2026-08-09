/**
 * Parser untuk sheet "Series Inflasi (2022=100)" / "Series IHK (2022=100)"
 * (dan varian 2018=100). Sheet ini opsional -- dipakai untuk melengkapi
 * Tabel 2 (perbandingan antar tahun) dan Gambar 1/tren infografis.
 *
 * Bila sheet tidak ada atau datanya kosong, fungsi ini mengembalikan
 * struktur kosong secara graceful (BUKAN error) supaya render tetap bisa
 * lanjut tanpa bagian pembanding tsb -- konsisten dengan prinsip "jangan
 * mengarang angka BPS".
 */

const MONTH_HEADERS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sept', 'Okt', 'Nov', 'Des'];

function findSeriesSheet(wb, base = '2022=100') {
  return wb.getWorksheet(`Series Inflasi (${base})`) || wb.getWorksheet(`Series IHK (${base})`);
}

function cellVal(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && v.result !== undefined) return Number(v.result);
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Baca sheet "Series Inflasi (xxxx=100)" dengan struktur:
 *  Row1: tahun (berulang tiap 12 kolom, mulai kolom C)
 *  Row2: nama bulan Jan..Dec
 *  Kolom B: label baris ("Inflasi Bulanan"/"Inflasi Tahun Kalender"/"Inflasi YoY"/"IHK")
 * Mengembalikan { years:[...], monthlyYoy:{year:[12 nilai|null]}, mtm:{...}, ytd:{...} }
 */
function parseSeriesInflasi(wb, base = '2022=100') {
  const ws = findSeriesSheet(wb, base);
  const empty = { years: [], monthlyYoy: {}, mtm: {}, ytd: {}, ihk: {} };
  if (!ws) return empty;

  const yearRow = ws.getRow(1);
  const monthRow = ws.getRow(2);

  // peta kolom -> {year, monthIndex}
  const colMap = [];
  let currentYear = null;
  for (let c = 3; c <= ws.columnCount; c++) {
    const y = yearRow.getCell(c).value;
    if (y) currentYear = y;
    const m = monthRow.getCell(c).value;
    const mi = MONTH_HEADERS.indexOf(String(m || '').slice(0, 3));
    if (currentYear && mi >= 0) colMap.push({ col: c, year: currentYear, monthIndex: mi });
  }

  const result = { years: [], monthlyYoy: {}, mtm: {}, ytd: {}, ihk: {} };
  const yearsSet = new Set();

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = String(row.getCell(2).value || '').trim();
    if (!label) continue;

    let bucket = null;
    if (/yoy/i.test(label)) bucket = 'monthlyYoy';
    else if (/bulanan/i.test(label)) bucket = 'mtm';
    else if (/tahun kalender|ytd/i.test(label)) bucket = 'ytd';
    else if (/^ihk$/i.test(label)) bucket = 'ihk';
    if (!bucket) continue;

    for (const cm of colMap) {
      const val = cellVal(row, cm.col);
      if (val === null) continue;
      yearsSet.add(cm.year);
      if (!result[bucket][cm.year]) result[bucket][cm.year] = new Array(12).fill(null);
      result[bucket][cm.year][cm.monthIndex] = val;
    }
  }

  result.years = [...yearsSet].sort();
  return result;
}

/**
 * Susun data siap pakai untuk narrativeEngine.buildPerbandinganAntarTahun,
 * tableBuilder.buildTabel2, dan infographicBuilder (Gambar 1 & tren 13 bulan).
 */
function buildSeriesHistory(wb, ctx) {
  const s2022 = parseSeriesInflasi(wb, '2022=100');
  const s2018 = parseSeriesInflasi(wb, '2018=100');
  const s = s2022.years.length > 0 ? s2022 : s2018;

  const bulanIdx = MONTH_ID.findIndex((m) => m.toLowerCase() === ctx.bulanNow.slice(0, 3).toLowerCase());
  const targetMonthIdx = bulanIdx >= 0 ? bulanIdx : parseInt(ctx.bulanNowNumeric || '0', 10) - 1;

  const yoyForMonth = s.years
    .filter((y) => s.monthlyYoy[y] && s.monthlyYoy[y][targetMonthIdx] !== null && s.monthlyYoy[y][targetMonthIdx] !== undefined)
    .map((y) => ({ tahun: y, nilai: s.monthlyYoy[y][targetMonthIdx] }));

  const ytdForMonth = s.years
    .filter((y) => s.ytd[y] && s.ytd[y][targetMonthIdx] !== null && s.ytd[y][targetMonthIdx] !== undefined)
    .map((y) => ({ tahun: y, nilai: s.ytd[y][targetMonthIdx] }));

  const momForMonth = s.years
    .filter((y) => s.mtm[y] && s.mtm[y][targetMonthIdx] !== null && s.mtm[y][targetMonthIdx] !== undefined)
    .map((y) => ({ tahun: y, nilai: s.mtm[y][targetMonthIdx] }));

  // Tren 13 bulan terakhir (untuk infografis) dari titik target mundur.
  const trend13 = [];
  if (s.years.length > 0 && targetMonthIdx >= 0) {
    let y = parseInt(ctx.tahunNow, 10);
    let mi = targetMonthIdx;
    const points = [];
    for (let i = 0; i < 13; i++) {
      const val = s.monthlyYoy[y] ? s.monthlyYoy[y][mi] : null;
      if (val !== null && val !== undefined) {
        points.unshift({ label: `${MONTH_ID[mi]}${i === 0 ? `'${String(y).slice(2)}` : ''}`, nilai: val });
      }
      mi -= 1;
      if (mi < 0) {
        mi = 11;
        y -= 1;
      }
    }
    trend13.push(...points);
  }

  return {
    yoy: yoyForMonth,
    ytd: ytdForMonth,
    mom: momForMonth,
    years: s.years,
    chartYears: s.years.slice(-3),
    monthlyYoy: s.monthlyYoy,
    trend13,
    dataTersedia: s.years.length > 0,
  };
}

module.exports = { parseSeriesInflasi, buildSeriesHistory };
