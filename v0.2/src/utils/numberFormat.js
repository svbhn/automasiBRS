/**
 * Utilitas pemformatan angka gaya BRS BPS:
 *  - Pemisah desimal koma ("3,72" bukan "3.72")
 *  - Nilai yang membulat ke 0,00 tapi bukan benar-benar nol ditulis "~0"
 *    (lihat keterangan Tabel 1 BRS: "~0 Data sangat kecil/mendekati nol")
 *  - Nilai negatif untuk andil/inflasi TIDAK memakai tanda minus di narasi;
 *    tanda minus hanya dipakai di tabel angka, sedangkan di narasi kata
 *    "deflasi"/"penurunan" itulah yang menggantikan tanda minus.
 */

const NEAR_ZERO_EPS = 0.005; // < 0.005 setelah dibulatkan 2 desimal -> 0,00

/**
 * Format angka ke string Indonesia dengan n desimal, tanpa tanda minus
 * (dipakai untuk narasi yang sudah punya kata "inflasi/deflasi/kenaikan/penurunan").
 */
function idNumber(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const abs = Math.abs(value);
  return abs.toFixed(decimals).replace('.', ',');
}

/**
 * Format angka ke string Indonesia dengan tanda minus dipertahankan
 * (dipakai untuk tabel angka mentah, kolom "Tingkat Inflasi").
 */
function idNumberSigned(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(value).toFixed(decimals).replace('.', ',');
}

/**
 * Format nilai untuk sel tabel BRS: otomatis mengembalikan simbol "~0"
 * ketika nilai sangat kecil/mendekati nol.
 */
function tableCell(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  if (Math.abs(value) < NEAR_ZERO_EPS) return '~0';
  return idNumberSigned(value, decimals);
}

/**
 * Menentukan status inflasi/deflasi/stabil dari sebuah nilai.
 * threshold default sama dengan ambang "~0" pada tabel BRS.
 */
function inflasiStatus(value, threshold = NEAR_ZERO_EPS) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'tidak-ada';
  if (Math.abs(value) < threshold) return 'stabil';
  return value > 0 ? 'inflasi' : 'deflasi';
}

/**
 * Kata kerja perubahan indeks: "kenaikan" utk inflasi, "penurunan" utk deflasi.
 */
function kataPerubahan(value) {
  const status = inflasiStatus(value);
  if (status === 'inflasi') return 'kenaikan';
  if (status === 'deflasi') return 'penurunan';
  return 'perubahan';
}

/**
 * Kata jenis: "inflasi" / "deflasi" / "stabil (tidak ada perubahan)"
 */
function kataJenis(value) {
  const status = inflasiStatus(value);
  if (status === 'inflasi') return 'inflasi';
  if (status === 'deflasi') return 'deflasi';
  return 'stabil';
}

/**
 * Rotasi kata sambung agar tidak monoton (dan/serta/juga), sesuai concern
 * notulen: "narasi kata dan, serta, juga bisa berubah-ubah yang jadi resiko".
 * Menggunakan indeks berjalan supaya deterministik & bisa direproduksi,
 * bukan random murni (penting untuk QA/reproducibility BPS).
 */
const KATA_SAMBUNG = ['serta', 'dan', 'juga'];
function kataSambung(index) {
  return KATA_SAMBUNG[index % KATA_SAMBUNG.length];
}

/**
 * Gabungkan daftar string dengan koma + kata sambung terakhir yang berotasi,
 * meniru pola kalimat panjang BRS (lihat paragraf komoditas dominan).
 */
function joinNarrativeList(items, sambungSeed = 0) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  const head = items.slice(0, -1).join(', ');
  const tail = items[items.length - 1];
  return `${head}, ${kataSambung(sambungSeed)} ${tail}`;
}

module.exports = {
  idNumber,
  idNumberSigned,
  tableCell,
  inflasiStatus,
  kataPerubahan,
  kataJenis,
  kataSambung,
  joinNarrativeList,
  NEAR_ZERO_EPS,
};
