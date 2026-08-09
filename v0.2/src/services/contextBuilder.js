const { resolveDOB } = require('../config/dob');
const { namaBulan } = require('./narrativeEngine');

/**
 * Menyusun konteks periode & wilayah (dipakai di seluruh narasi/tabel/
 * infografis) dari kombinasi:
 *  - meta yang terbaca otomatis dari file (bulan/tahun/kode wilayah, hanya
 *    tersedia bila format 'dataset')
 *  - input eksplisit dari pengguna di Step 1 frontend (periode & DOB),
 *    yang selalu diprioritaskan bila diisi supaya staf bisa mengoreksi jika
 *    deteksi otomatis meleset.
 */
function buildContext(parsed, userInput = {}) {
  const bulanNum = userInput.bulan || parsed.meta?.bulan || null;
  const tahunNum = userInput.tahun || parsed.meta?.tahun || null;

  if (!bulanNum || !tahunNum) {
    throw new Error(
      'Periode (bulan & tahun) tidak dapat dideteksi otomatis dari file. ' +
        'Mohon isi periode secara manual pada Step 1.'
    );
  }

  const bulanNowNumeric = String(bulanNum).padStart(2, '0');
  const bulanNow = namaBulan(bulanNum);
  const tahunNow = String(tahunNum);

  const prevYearNum = parseInt(tahunNow, 10) - 1;
  const bulanPrevYear = bulanNow;
  const tahunPrevYear = String(prevYearNum);

  const bulanDesemberLalu = 'Desember';
  const tahunDesemberLalu = tahunPrevYear;

  const kodeWilayah = userInput.kodeWilayah || parsed.meta?.kodeWilayah || parsed.meta?.kodeWilayahFromFilename;
  const dob = resolveDOB(kodeWilayah, parsed.meta?.namaKota);
  const namaWilayah = userInput.namaWilayah || `Provinsi ${dob.nama}`;

  return {
    bulanNow,
    bulanNowNumeric,
    tahunNow,
    bulanPrevYear,
    tahunPrevYear,
    bulanDesemberLalu,
    tahunDesemberLalu,
    namaWilayah,
    dob,
    kodeWilayah: dob.kodeWilayah,
  };
}

module.exports = { buildContext };
