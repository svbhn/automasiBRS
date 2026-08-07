const { KELOMPOK } = require('../config/kelompok');
const {
  idNumber,
  tableCell,
  inflasiStatus,
  kataPerubahan,
  kataJenis,
  joinNarrativeList,
} = require('../utils/numberFormat');

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function namaBulan(bulanNumOrStr) {
  const n = parseInt(bulanNumOrStr, 10);
  if (!n || n < 1 || n > 12) return String(bulanNumOrStr || '');
  return BULAN_ID[n - 1];
}

function persen(value) {
  return `${idNumber(value)} persen`;
}

/**
 * Menghitung IHK periode sebelumnya dari IHK sekarang & tingkat inflasi,
 * karena file olahan hanya menyimpan tingkat inflasi yang sudah dihitung,
 * bukan deret IHK historis. Rumus ini konsisten dengan metodologi BPS:
 *   inflasi(%) = (IHK_now / IHK_prev - 1) * 100
 *   =>  IHK_prev = IHK_now / (1 + inflasi/100)
 */
function ihkSebelum(ihkNow, tingkatPersen) {
  if (ihkNow === null || tingkatPersen === null) return null;
  return ihkNow / (1 + tingkatPersen / 100);
}

/* ------------------------------------------------------------------ */
/* Bagian pembuka & ringkasan (halaman depan + awal bagian 1)          */
/* ------------------------------------------------------------------ */

function buildRingkasan(data, ctx) {
  const { umum } = data;
  const { namaWilayah, bulanNow, tahunNow, bulanPrevYear, tahunPrevYear } = ctx;

  const jenisYoy = kataJenis(umum.infYoy);
  const ihkPrev = ihkSebelum(umum.ihk, umum.infYoy);

  const headline =
    `${bulanNow} ${tahunNow} ${jenisYoy} year on year (y-on-y) ${namaWilayah} sebesar ${persen(umum.infYoy)}.`;

  const paragraf1 =
    `Pada ${bulanNow} ${tahunNow} terjadi ${jenisYoy} year on year (y-on-y) ${namaWilayah} sebesar ` +
    `${persen(umum.infYoy)} dengan Indeks Harga Konsumen (IHK) sebesar ${idNumber(umum.ihk)}.`;

  // Paragraf 2: kelompok naik vs turun (kalimat panjang khas BRS)
  const naik = data.kelompok
    .filter((k) => inflasiStatus(k.infYoy) === 'inflasi')
    .sort((a, b) => (a.cfg?.kode || a.kode).localeCompare(b.cfg?.kode || b.kode));
  const turun = data.kelompok
    .filter((k) => inflasiStatus(k.infYoy) === 'deflasi')
    .sort((a, b) => (a.cfg?.kode || a.kode).localeCompare(b.cfg?.kode || b.kode));

  const naikPhrases = naik.map(
    (k, i) => `kelompok ${labelOf(k)} sebesar ${persen(k.infYoy)}`
  );
  const turunPhrases = turun.map(
    (k, i) => `kelompok ${labelOf(k)} sebesar ${persen(k.infYoy)}`
  );

  let paragraf2 = '';
  if (umum.infYoy >= 0) {
    paragraf2 = `Inflasi y-on-y terjadi karena adanya kenaikan harga yang ditunjukkan oleh naiknya indeks kelompok pengeluaran pada ${joinSemicolonList(naikPhrases)}.`;
    if (turunPhrases.length > 0) {
      paragraf2 += ` Sementara itu, kelompok pengeluaran yang mengalami penurunan indeks, yaitu ${joinSemicolonList(turunPhrases)}.`;
    }
  } else {
    paragraf2 = `Deflasi y-on-y terjadi karena adanya penurunan harga yang ditunjukkan oleh turunnya indeks kelompok pengeluaran pada ${joinSemicolonList(turunPhrases)}.`;
    if (naikPhrases.length > 0) {
      paragraf2 += ` Sementara itu, kelompok pengeluaran yang mengalami kenaikan indeks, yaitu ${joinSemicolonList(naikPhrases)}.`;
    }
  }

  const paragraf3 =
    `Tingkat inflasi month to month (m-to-m) ${namaWilayah} bulan ${bulanNow} ${tahunNow} sebesar ` +
    `${persen(umum.infMoM)} dan tingkat inflasi year to date (y-to-d) ${namaWilayah} bulan ${bulanNow} ${tahunNow} ` +
    `sebesar ${persen(umum.infYtd)}.`;

  return { headline, paragraf1, paragraf2, paragraf3, ihkPrev };
}

function labelOf(k) {
  return (k.cfg ? k.cfg.label : titleCaseLabel(k.labelUpper)).toLowerCase();
}

function titleCaseLabel(upper) {
  return String(upper)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Gabungkan list kalimat panjang bergaya BRS: dipisah titik koma, dengan
 * kata "serta" sebelum item terakhir (pola persis paragraf 2 BRS asli).
 */
function joinSemicolonList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const head = items.slice(0, -1).join('; ');
  const tail = items[items.length - 1];
  return `${head}; serta ${tail}`;
}

/* ------------------------------------------------------------------ */
/* Paragraf komoditas dominan (andil inflasi/deflasi MoM & YoY)        */
/* ------------------------------------------------------------------ */

function buildKomoditasDominanParagraf(pivot, label, catatanLimit = null) {
  const listInflasi = catatanLimit ? pivot.andilInflasiYoY.slice(0, catatanLimit) : pivot.andilInflasiYoY;
  const listDeflasi = catatanLimit ? pivot.andilDeflasiYoY.slice(0, catatanLimit) : pivot.andilDeflasiYoY;

  const namaInflasi = listInflasi.map((c) => c.nama.toLowerCase());
  const namaDeflasi = listDeflasi.map((c) => c.nama.toLowerCase());

  let out = '';
  if (namaInflasi.length > 0) {
    out += `Komoditas yang dominan memberikan andil/sumbangan inflasi ${label} pada periode ini, antara lain ${joinNarrativeList(
      namaInflasi,
      0
    )}.`;
  }
  if (namaDeflasi.length > 0) {
    out += ` Sementara itu, komoditas yang dominan memberikan andil/sumbangan deflasi ${label}, antara lain ${joinNarrativeList(
      namaDeflasi,
      1
    )}.`;
  }
  return out.trim();
}

/* ------------------------------------------------------------------ */
/* Paragraf andil per kelompok (yoy) - kelompok mana yg sumbang inflasi/deflasi */
/* ------------------------------------------------------------------ */

function buildAndilKelompokParagraf(data, ctx) {
  const { bulanNow, tahunNow } = ctx;
  const inflasiList = [];
  const deflasiList = [];
  const netral = [];

  for (const k of data.kelompok) {
    const status = inflasiStatus(k.andilYoy);
    const phrase = `kelompok ${labelOf(k)} sebesar ${persen(k.andilYoy)}`;
    if (status === 'inflasi') inflasiList.push(phrase);
    else if (status === 'deflasi') deflasiList.push(phrase);
    else netral.push(`kelompok ${labelOf(k)}`);
  }

  let out = `Pada ${bulanNow} ${tahunNow}, kelompok pengeluaran yang memberikan andil/sumbangan inflasi y-on-y, yaitu ${joinSemicolonList(
    inflasiList
  )}.`;
  if (deflasiList.length > 0) {
    out += ` Sementara itu, kelompok pengeluaran yang memberikan andil/sumbangan deflasi y-on-y, yaitu ${joinSemicolonList(
      deflasiList
    )}.`;
  }
  if (netral.length > 0) {
    out += ` Adapun kelompok yang tidak memberikan andil/sumbangan inflasi maupun deflasi y-on-y, yaitu ${joinNarrativeList(
      netral
    )}.`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Subbab per kelompok (1.1 - 1.11)                                    */
/* ------------------------------------------------------------------ */

function buildSubkelompokKalimat(kelompok, ctx) {
  const subs = kelompok.subkelompok || [];
  if (subs.length === 0) return null;

  const inflasiSubs = subs.filter((s) => inflasiStatus(s.infYoy) === 'inflasi');
  const deflasiSubs = subs.filter((s) => inflasiStatus(s.infYoy) === 'deflasi');
  const netralSubs = subs.filter((s) => inflasiStatus(s.infYoy) === 'stabil');

  const allSameStatus = inflasiSubs.length === subs.length || deflasiSubs.length === subs.length;

  if (allSameStatus && subs.length > 1) {
    const status = inflasiSubs.length === subs.length ? 'inflasi' : 'deflasi';
    const sorted = [...subs].sort((a, b) =>
      status === 'inflasi' ? b.infYoy - a.infYoy : a.infYoy - b.infYoy
    );
    const tertinggi = sorted[0];
    const terendah = sorted[sorted.length - 1];
    return (
      `Seluruh subkelompok mengalami ${status} y-on-y, dengan subkelompok yang mengalami ${status} ` +
      `y-on-y tertinggi, yaitu subkelompok ${tertinggi.nama.toLowerCase()} sebesar ${persen(tertinggi.infYoy)}, ` +
      `sedangkan ${status} y-on-y terendah terjadi pada subkelompok ${terendah.nama.toLowerCase()} sebesar ${persen(
        terendah.infYoy
      )}.`
    );
  }

  // Campuran inflasi/deflasi/stabil -> pola "Dari N subkelompok..., M mengalami inflasi..."
  let out = `Dari ${subs.length} subkelompok pada kelompok ini, `;
  const parts = [];
  if (inflasiSubs.length > 0) {
    const label = inflasiSubs.length === 1 ? 'satu subkelompok mengalami' : `${inflasiSubs.length} subkelompok mengalami`;
    const items = inflasiSubs.map((s) => `subkelompok ${s.nama.toLowerCase()} sebesar ${persen(s.infYoy)}`);
    parts.push(`${label} inflasi y-on-y, yaitu ${joinSemicolonList(items)}`);
  }
  if (deflasiSubs.length > 0) {
    const items = deflasiSubs.map((s) => `subkelompok ${s.nama.toLowerCase()} sebesar ${persen(s.infYoy)}`);
    const lead = parts.length > 0 ? 'Sementara itu, ' : '';
    const label = deflasiSubs.length === 1 ? 'satu subkelompok mengalami' : `${deflasiSubs.length} subkelompok mengalami`;
    parts.push(`${lead}${label} deflasi y-on-y, yaitu ${joinSemicolonList(items)}`);
  }
  out += parts.join('. ') + '.';
  if (netralSubs.length > 0) {
    const items = netralSubs.map((s) => `subkelompok ${s.nama.toLowerCase()}`);
    out += ` Adapun ${joinNarrativeList(items)} cenderung tidak mengalami perubahan angka indeks.`;
  }
  return out;
}

function buildSubbab(kelompok, data, ctx) {
  const { namaWilayah, bulanNow, tahunNow, bulanPrevYear, tahunPrevYear } = ctx;
  const cfg = kelompok.cfg;
  const label = cfg ? cfg.label : titleCaseLabel(kelompok.labelUpper);
  const subbabNo = cfg ? cfg.subbab : '1.x';

  const status = inflasiStatus(kelompok.infYoy);
  const jenis = kataJenis(kelompok.infYoy);
  const kerja = kataPerubahan(kelompok.infYoy);
  const ihkPrev = ihkSebelum(kelompok.ihk, kelompok.infYoy);

  const paragrafBuka =
    status === 'stabil'
      ? `Kelompok ini pada ${bulanNow} ${tahunNow} di ${namaWilayah} cenderung tidak mengalami perubahan Indeks ` +
        `Harga Konsumen (IHK) secara signifikan dibandingkan ${bulanPrevYear} ${tahunPrevYear}.`
      : `Kelompok ini pada ${bulanNow} ${tahunNow} di ${namaWilayah} mengalami ${jenis} y-on-y sebesar ` +
        `${persen(kelompok.infYoy)} atau terjadi ${kerja} indeks dari ${idNumber(ihkPrev)} pada ${bulanPrevYear} ` +
        `${tahunPrevYear} menjadi ${idNumber(kelompok.ihk)} pada ${bulanNow} ${tahunNow}.`;

  const paragrafSubkelompok = buildSubkelompokKalimat(kelompok, ctx);

  const andilStatus = inflasiStatus(kelompok.andilYoy);
  let paragrafAndil;
  if (andilStatus === 'stabil') {
    paragrafAndil = `Kelompok ini pada ${bulanNow} ${tahunNow} tidak memberikan andil/sumbangan inflasi y-on-y secara signifikan.`;
  } else {
    paragrafAndil = `Kelompok ini pada ${bulanNow} ${tahunNow} memberikan andil/sumbangan ${andilStatus} y-on-y sebesar ${persen(
      kelompok.andilYoy
    )}.`;
  }

  // Komoditas dominan per kelompok - hanya tersedia bila sumber file berupa
  // DATASET mentah (lihat catatan pada excelParser.parseDatasetSheet).
  let paragrafKomoditas = null;
  if (data.komoditasByKelompok && data.komoditasByKelompok[kelompok.kode]) {
    const kk = data.komoditasByKelompok[kelompok.kode];
    const namaInf = kk.andilInflasiYoY.slice(0, 20).map((c) => c.nama.toLowerCase());
    const namaDef = kk.andilDeflasiYoY.slice(0, 20).map((c) => c.nama.toLowerCase());
    if (namaInf.length || namaDef.length) {
      paragrafKomoditas = '';
      if (namaInf.length) {
        paragrafKomoditas += `Komoditas yang dominan memberikan andil/sumbangan inflasi y-on-y, yaitu ${joinNarrativeList(
          namaInf,
          0
        )}.`;
      }
      if (namaDef.length) {
        paragrafKomoditas += `${namaInf.length ? ' Sementara itu, k' : 'K'}omoditas yang dominan memberikan andil/sumbangan deflasi y-on-y, yaitu ${joinNarrativeList(
          namaDef,
          1
        )}.`;
      }
    }
  }

  const mtmStatus = inflasiStatus(kelompok.andilMoM);
  let paragrafMtm;
  if (mtmStatus === 'stabil') {
    paragrafMtm = `Adapun, kelompok ini pada ${bulanNow} ${tahunNow} tidak memberikan andil/sumbangan inflasi maupun deflasi m-to-m.`;
  } else {
    paragrafMtm = `Kelompok ini pada ${bulanNow} ${tahunNow} memberikan andil/sumbangan ${mtmStatus} m-to-m sebesar ${persen(
      kelompok.andilMoM
    )}.`;
  }

  return {
    subbab: subbabNo,
    judul: label,
    kode: kelompok.kode,
    paragraf: [paragrafBuka, paragrafSubkelompok, paragrafAndil, paragrafKomoditas, paragrafMtm].filter(Boolean),
    dataRingkas: {
      ihk: kelompok.ihk,
      infYoy: kelompok.infYoy,
      infMoM: kelompok.infMoM,
      infYtd: kelompok.infYtd,
      andilYoy: kelompok.andilYoy,
      andilMoM: kelompok.andilMoM,
      status,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Bagian 2: perbandingan inflasi antar tahun                          */
/* ------------------------------------------------------------------ */

function buildPerbandinganAntarTahun(data, ctx, seriesHistory) {
  const { namaWilayah, bulanNow, tahunNow } = ctx;
  const { umum } = data;

  let out =
    `Pada ${bulanNow} ${tahunNow}, tingkat inflasi y-on-y ${namaWilayah} sebesar ${persen(umum.infYoy)} dan ` +
    `tingkat inflasi y-to-d ${namaWilayah} sebesar ${persen(umum.infYtd)}.`;

  if (seriesHistory && seriesHistory.yoy && seriesHistory.yoy.length >= 2) {
    const prevYears = seriesHistory.yoy.slice(0, -1); // tidak termasuk tahun berjalan
    const kalimatYoy = prevYears
      .map((y) => `tingkat inflasi y-on-y untuk ${bulanNow} ${y.tahun} sebesar ${persen(y.nilai)}`)
      .join(', sedangkan ');
    out += ` ${kalimatYoy.charAt(0).toUpperCase()}${kalimatYoy.slice(1)}.`;
  } else {
    out +=
      ` (Data pembanding y-on-y/y-to-d dua tahun sebelumnya belum lengkap pada sheet Series -- ` +
      `lengkapi sheet "Series Inflasi" pada file olahan agar paragraf perbandingan antar tahun terisi otomatis.)`;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

function buildNarrative(data, ctx, seriesHistory = null) {
  const ringkasan = buildRingkasan(data, ctx);
  const andilKelompokParagraf = buildAndilKelompokParagraf(data, ctx);
  const komoditasYoY = buildKomoditasDominanParagraf(data.pivot, 'y-on-y');
  const komoditasMtM = buildKomoditasDominanParagraf(
    { andilInflasiYoY: data.pivot.andilInflasiMoM, andilDeflasiYoY: data.pivot.andilDeflasiMoM },
    'm-to-m'
  );
  const subbab = data.kelompok.map((k) => buildSubbab(k, data, ctx));
  const perbandingan = buildPerbandinganAntarTahun(data, ctx, seriesHistory);

  return {
    ringkasan,
    paragrafPembukaBagian1:
      `Perkembangan harga berbagai komoditas pada ${ctx.bulanNow} ${ctx.tahunNow} secara umum menunjukkan adanya ` +
      `${inflasiStatus(data.umum.infYoy) === 'inflasi' ? 'kenaikan' : 'penurunan'}. Berdasarkan hasil pemantauan kota IHK di ${ctx.namaWilayah}, ` +
      `pada ${ctx.bulanNow} ${ctx.tahunNow} terjadi ${kataJenis(data.umum.infYoy)} y-on-y sebesar ${persen(
        data.umum.infYoy
      )} atau terjadi ${kataPerubahan(data.umum.infYoy)} Indeks Harga Konsumen (IHK) dari ${idNumber(
        ringkasan.ihkPrev
      )} pada ${ctx.bulanPrevYear} ${ctx.tahunPrevYear} menjadi ${idNumber(data.umum.ihk)} pada ${ctx.bulanNow} ${ctx.tahunNow}. ` +
      `Tingkat inflasi m-to-m sebesar ${persen(data.umum.infMoM)} dan tingkat inflasi y-to-d sebesar ${persen(
        data.umum.infYtd
      )}.`,
    komoditasDominanYoY: komoditasYoY,
    komoditasDominanMtM: komoditasMtM,
    andilKelompokParagraf,
    subbab,
    perbandinganAntarTahun: perbandingan,
  };
}

module.exports = {
  buildNarrative,
  namaBulan,
  ihkSebelum,
  persen,
};
