const { idNumber } = require('../utils/numberFormat');

/**
 * Pembangun infografis dalam format SVG.
 *
 * KEPUTUSAN DESAIN (mengacu notulen rapat, poin Tim IT):
 * "Belum menemukan cara edit script dengan file .ai, tapi bisa kalau .png
 * atau .pdf" -> backend TIDAK mencoba menghasilkan/mengedit file .ai
 * (format biner proprietary Adobe yang tidak punya SDK terbuka untuk Node.js).
 * Sebagai gantinya backend menghasilkan SVG: format vektor terbuka yang bisa
 * langsung dibuka & diedit di Adobe Illustrator/InDesign (File > Open /
 * Place, teks & path tetap dapat disunting) sekaligus mudah dikonversi ke
 * PNG/PDF oleh Tim IT -- persis dua format yang menurut mereka feasible.
 */

const COLORS = {
  orange: '#F7931E',
  orangeDark: '#E8730A',
  purple: '#5B3E96',
  green: '#0E7C61',
  teal: '#1F9E8F',
  dark: '#2A2A2A',
  gray: '#8C8C8C',
  white: '#FFFFFF',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Gambar 1: grafik batang tingkat inflasi y-on-y per bulan, dibandingkan
 * antar tahun (identik dengan pola grafik pada halaman 10 BRS contoh).
 */
function buildGambar1SVG(seriesHistory, ctx) {
  const width = 900;
  const height = 380;
  const marginLeft = 40;
  const marginBottom = 40;
  const marginTop = 20;
  const plotW = width - marginLeft - 20;
  const plotH = height - marginTop - marginBottom;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sept', 'Okt', 'Nov', 'Des'];
  const years = (seriesHistory && seriesHistory.chartYears) || [ctx.tahunNow];
  const barColors = [COLORS.purple, COLORS.orangeDark, COLORS.green].slice(0, years.length);

  const monthlyData = (seriesHistory && seriesHistory.monthlyYoy) || null; // { [year]: [12 nilai|null] }

  let maxAbs = 5;
  if (monthlyData) {
    for (const y of years) {
      for (const v of monthlyData[y] || []) {
        if (v !== null && v !== undefined) maxAbs = Math.max(maxAbs, Math.abs(v));
      }
    }
  }
  const yMax = Math.ceil(maxAbs * 1.15);
  const groupW = plotW / 12;
  const barW = (groupW * 0.7) / years.length;

  let bars = '';
  let labels = '';
  for (let m = 0; m < 12; m++) {
    const gx = marginLeft + m * groupW + groupW * 0.15;
    years.forEach((y, yi) => {
      const val = monthlyData && monthlyData[y] ? monthlyData[y][m] : null;
      if (val === null || val === undefined) return;
      const h = (Math.abs(val) / yMax) * plotH;
      const x = gx + yi * barW;
      const yTop = marginTop + plotH - h;
      bars += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${(barW * 0.85).toFixed(1)}" height="${h.toFixed(1)}" fill="${barColors[yi]}" rx="2"/>`;
      bars += `<text x="${(x + barW * 0.42).toFixed(1)}" y="${(yTop - 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${idNumber(val)}</text>`;
    });
    labels += `<text x="${(marginLeft + m * groupW + groupW / 2).toFixed(1)}" y="${height - marginBottom + 16}" font-size="11" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${months[m]}-${months[m]}</text>`;
  }

  const legend = years
    .map(
      (y, i) =>
        `<rect x="${marginLeft + i * 110}" y="${height - 14}" width="10" height="10" fill="${barColors[i]}"/>` +
        `<text x="${marginLeft + i * 110 + 14}" y="${height - 5}" font-size="10" font-family="Arial" fill="${COLORS.dark}">y-on-y ${y}</text>`
    )
    .join('');

  return `<svg viewBox="0 0 ${width} ${height + 20}" xmlns="http://www.w3.org/2000/svg" font-family="Arial">
  <rect width="100%" height="100%" fill="${COLORS.white}"/>
  <line x1="${marginLeft}" y1="${marginTop + plotH}" x2="${width - 20}" y2="${marginTop + plotH}" stroke="#ccc"/>
  ${bars}
  ${labels}
  ${legend}
</svg>`;
}

/**
 * Infografis halaman terakhir BRS: ringkasan angka utama, andil inflasi
 * y-on-y per kelompok pengeluaran, tren 13 bulan terakhir, & label wilayah.
 * Mengikuti tata letak "Gambar 2" pada BRS contoh.
 */
function buildInfografisSVG(data, ctx, seriesHistory) {
  const width = 1000;
  const height = 1414; // rasio A4 potret
  const { umum, kelompok } = data;

  // --- Header angka utama ---
  const headerBadges = [
    { label: 'Month-to-Month (M-to-M)', value: umum.infMoM, color: COLORS.teal },
    { label: 'Year-to-Date (Y-to-D)', value: umum.infYtd, color: COLORS.green },
    { label: 'Year-on-Year (Y-on-Y)', value: umum.infYoy, color: COLORS.purple },
  ]
    .map((b, i) => {
      const x = 40 + i * 320;
      const type = b.value >= 0 ? 'INFLASI' : 'DEFLASI';
      return `<g>
        <rect x="${x}" y="140" width="290" height="90" rx="10" fill="${b.color}"/>
        <text x="${x + 20}" y="170" font-size="14" fill="white" font-family="Arial">${esc(b.label)}</text>
        <text x="${x + 20}" y="210" font-size="30" fill="white" font-family="Arial" font-weight="bold">${type} ${idNumber(
        Math.abs(b.value)
      )}%</text>
      </g>`;
    })
    .join('');

  // --- Andil per kelompok (bar chart horizontal-ish, seperti Gambar 2) ---
  const barChartTop = 300;
  const barChartH = 220;
  const n = kelompok.length;
  const chartW = width - 80;
  const groupW = chartW / n;
  const maxAndil = Math.max(0.1, ...kelompok.map((k) => Math.abs(k.andilYoy || 0)));
  const zeroY = barChartTop + barChartH * 0.6;
  const scale = (barChartH * 0.35) / maxAndil;

  const andilBars = kelompok
    .map((k, i) => {
      const cx = 40 + i * groupW + groupW / 2;
      const v = k.andilYoy || 0;
      const barH = Math.abs(v) * scale;
      const y = v >= 0 ? zeroY - barH : zeroY;
      const color = v >= 0 ? COLORS.orange : COLORS.gray;
      const label = (k.cfg ? k.cfg.infografisLabel : k.labelUpper).split('\n');
      const labelSvg = label
        .map((line, li) => `<tspan x="${cx}" dy="${li === 0 ? 0 : 11}">${esc(line)}</tspan>`)
        .join('');
      return `<g>
        <rect x="${(cx - groupW * 0.28).toFixed(1)}" y="${y.toFixed(1)}" width="${(groupW * 0.56).toFixed(
        1
      )}" height="${Math.max(barH, 1).toFixed(1)}" fill="${color}" rx="3"/>
        <text x="${cx}" y="${(v >= 0 ? y - 6 : y + barH + 14)}" font-size="11" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${idNumber(
        v
      )}</text>
        <text x="${cx}" y="${zeroY + barChartH * 0.42}" font-size="9.5" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${labelSvg}</text>
      </g>`;
    })
    .join('');

  // --- Tren y-on-y 13 bulan terakhir (line chart sederhana) bila tersedia ---
  let trendSvg = '';
  if (seriesHistory && seriesHistory.trend13 && seriesHistory.trend13.length > 1) {
    const trend = seriesHistory.trend13;
    const tTop = 600;
    const tH = 180;
    const tW = width - 80;
    const tMax = Math.max(...trend.map((t) => t.nilai), 1);
    const tMin = Math.min(...trend.map((t) => t.nilai), 0);
    const range = tMax - tMin || 1;
    const stepX = tW / (trend.length - 1);
    const points = trend
      .map((t, i) => {
        const x = 40 + i * stepX;
        const y = tTop + tH - ((t.nilai - tMin) / range) * tH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const dots = trend
      .map((t, i) => {
        const x = 40 + i * stepX;
        const y = tTop + tH - ((t.nilai - tMin) / range) * tH;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${COLORS.teal}"/>
        <text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" font-size="10" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${idNumber(
          t.nilai
        )}</text>
        <text x="${x.toFixed(1)}" y="${tTop + tH + 16}" font-size="9" text-anchor="middle" fill="${COLORS.dark}" font-family="Arial">${esc(t.label)}</text>`;
      })
      .join('');
    trendSvg = `<text x="40" y="${tTop - 16}" font-size="15" font-family="Arial" fill="${COLORS.dark}" font-weight="bold">Tingkat Inflasi Year-on-Year (Y-on-Y, %) ${esc(
      ctx.namaWilayah
    )}</text>
    <polyline points="${points}" fill="none" stroke="${COLORS.teal}" stroke-width="2.5"/>
    ${dots}`;
  }

  const yoyText = umum.infYoy >= 0 ? 'inflasi' : 'deflasi';

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="Arial">
  <rect width="100%" height="100%" fill="${COLORS.white}"/>
  <text x="40" y="60" font-size="15" fill="${COLORS.purple}" font-family="Arial">PERKEMBANGAN</text>
  <text x="40" y="88" font-size="26" fill="${COLORS.purple}" font-family="Arial" font-weight="bold">INDEKS HARGA KONSUMEN</text>
  <text x="40" y="114" font-size="20" fill="${COLORS.purple}" font-family="Arial" font-weight="bold">${esc(
    ctx.namaWilayah.toUpperCase()
  )} ${esc(ctx.bulanNow.toUpperCase())} ${esc(ctx.tahunNow)}</text>
  ${headerBadges}
  <text x="40" y="${barChartTop - 20}" font-size="15" font-family="Arial" fill="${COLORS.dark}" font-weight="bold">Andil Inflasi Year-on-Year (Y-on-Y, %) menurut Kelompok Pengeluaran</text>
  <line x1="40" y1="${zeroY}" x2="${width - 40}" y2="${zeroY}" stroke="#ccc"/>
  ${andilBars}
  ${trendSvg}
  <rect x="0" y="${height - 90}" width="${width}" height="90" fill="${COLORS.purple}"/>
  <text x="40" y="${height - 50}" font-size="13" fill="white" font-family="Arial">Pada ${esc(ctx.bulanNow)} ${esc(
    ctx.tahunNow
  )} terjadi ${yoyText} year-on-year (y-on-y) ${esc(ctx.namaWilayah)} sebesar ${idNumber(
    Math.abs(umum.infYoy)
  )} persen dengan Indeks Harga Konsumen (IHK) sebesar ${idNumber(umum.ihk)}.</text>
  <text x="40" y="${height - 25}" font-size="12" fill="white" font-family="Arial">BADAN PUSAT STATISTIK -- ${esc(
    ctx.namaWilayah.toUpperCase()
  )}</text>
</svg>`;
}

module.exports = { buildGambar1SVG, buildInfografisSVG };
