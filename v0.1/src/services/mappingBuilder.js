const { persen } = require('./narrativeEngine');
const { inflasiStatus, idNumber } = require('../utils/numberFormat');

/**
 * Menyusun pratinjau pemetaan "cell pivot -> kalimat baku" untuk Step 2
 * frontend (panel-2 pada frontend.html), termasuk menandai cell yang perlu
 * ditinjau manual staf -- mengikuti concern notulen rapat soal risiko
 * kekeliruan data hasil pivot Excel.
 *
 * Kriteria "perlu tinjauan manual" (defensif, tidak pernah menyimpulkan
 * sendiri angka yang benar):
 *  1) Kelompok tanpa rincian subkelompok (sheet Subkelompok kosong/collapse
 *     untuk kelompok tsb) -> narasi subbab akan lebih pendek dari biasanya.
 *  2) Nilai mendekati nol (~0 di kedua sisi ambang) -> rawan salah baca
 *     inflasi/deflasi bila staf sumber sebelumnya memakai pembulatan beda.
 *  3) Kode kelompok pada file tidak dikenali di registry 11 kelompok baku.
 */
function buildMappingPreview(data) {
  const rows = [];
  const flagged = [];

  for (const k of data.kelompok) {
    const label = k.cfg ? k.cfg.label : k.labelUpper;
    const statusYoy = inflasiStatus(k.infYoy);
    const kalimat =
      statusYoy === 'stabil'
        ? `"…kelompok ${label.toLowerCase()} relatif stabil, tidak mengalami perubahan indeks yang signifikan…"`
        : `"…naiknya indeks kelompok pengeluaran pada kelompok ${label.toLowerCase()} sebesar ${persen(k.infYoy)}…"`;

    rows.push({
      sumber: `Sheet "Kelompok" · Baris "${k.labelUpper}"`,
      nilai: `y-on-y = ${idNumber(k.infYoy)} · andil = ${idNumber(k.andilYoy)}`,
      narasi: kalimat,
      kelompokKode: k.kode,
    });

    const alasan = [];
    if (!k.subkelompok || k.subkelompok.length === 0) {
      alasan.push('Rincian subkelompok tidak ditemukan pada file (sheet Subkelompok kosong untuk kelompok ini).');
    }
    if (Math.abs(k.infYoy) < 0.05 || Math.abs(k.andilYoy) < 0.005) {
      alasan.push('Nilai sangat kecil/mendekati nol -- rawan salah baca sebagai inflasi/deflasi.');
    }
    if (!k.cfg) {
      alasan.push('Label kelompok pada file tidak cocok dengan salah satu dari 11 kelompok baku BRS.');
    }
    if (alasan.length > 0) {
      flagged.push({ kelompok: label, kode: k.kode, alasan });
    }
  }

  // Contoh baris komoditas dominan (ditampilkan sebagai satu baris ringkas,
  // bukan seluruh daftar, supaya UI Step 2 tetap ringkas seperti mockup).
  if (data.pivot && data.pivot.andilInflasiYoY.length > 0) {
    const top3 = data.pivot.andilInflasiYoY.slice(0, 3).map((c) => c.nama.toLowerCase());
    rows.push({
      sumber: 'Sheet "Pivot" · Komoditas dominan andil inflasi y-on-y',
      nilai: top3.join(', ') + '…',
      narasi: `"Komoditas yang dominan memberikan andil/sumbangan inflasi y-on-y, antara lain ${top3.join(', ')}…"`,
      kelompokKode: null,
    });
  }

  return {
    kelompokTerpetakan: data.kelompok.length,
    totalKelompokBaku: 11,
    rows,
    perluTinjauan: flagged,
  };
}

module.exports = { buildMappingPreview };
