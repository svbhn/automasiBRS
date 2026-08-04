/**
 * Registry Daerah Otonom Baru (DOB) wilayah Papua.
 *
 * Sesuai notulen rapat 22 Juli 2026: "Akan ada perubahan format skrip terutama
 * Papua Tengah yang memiliki dua kota inflasi (dan juga untuk kedepannya)."
 * dan "akan ada 4 file untuk tiap DOB".
 *
 * PENTING: kodeWilayah di bawah adalah SEED/perkiraan awal dan perlu
 * diverifikasi Tim Harga terhadap Master Wilayah BPS Pusat. Nama provinsi
 * yang benar SELALU diprioritaskan dari kolom "Nama Kota" pada sheet DATASET
 * file yang diunggah (lihat resolveDOB()), bukan dari tabel statis ini.
 * Tabel ini hanya fallback ketika file berbentuk "sudah dipivot" (sheet
 * Pivot/Kelompok/Subkelompok) yang tidak menyertakan kolom Kd.Kota/Nama Kota.
 *
 * Terverifikasi langsung dari data sample yang diunggah:
 *   9400 -> "PROV PAPUA"
 *   9500 -> "PROV PAPUA SELATAN"
 *   9700 -> "PROV PAPUA PEGUNUNGAN"
 * Entri lain (91xx/92xx/93xx) masih perkiraan -- lengkapi lewat
 * PUT /api/dob/:kode ketika file DOB tsb pertama kali diunggah.
 */

const DOB = {
  9400: {
    kodeWilayah: '9400',
    nama: 'Papua',
    namaLengkap: 'Provinsi Papua',
    jumlahKotaIHK: 1,
    kotaIHK: ['Jayapura'],
    brsNomorPrefix: '94',
    terverifikasi: true,
  },
  9500: {
    kodeWilayah: '9500',
    nama: 'Papua Selatan',
    namaLengkap: 'Provinsi Papua Selatan',
    jumlahKotaIHK: 1,
    kotaIHK: ['Merauke'],
    brsNomorPrefix: '95',
    terverifikasi: true,
  },
  9700: {
    kodeWilayah: '9700',
    nama: 'Papua Pegunungan',
    namaLengkap: 'Provinsi Papua Pegunungan',
    jumlahKotaIHK: 1,
    kotaIHK: ['Wamena'],
    brsNomorPrefix: '97',
    terverifikasi: true,
  },
  9300: {
    kodeWilayah: '9300',
    nama: 'Papua Tengah',
    namaLengkap: 'Provinsi Papua Tengah',
    jumlahKotaIHK: 2,
    kotaIHK: ['Nabire', 'Timika'],
    brsNomorPrefix: '93',
    catatan:
      'Provinsi ini memiliki 2 kota pantauan IHK sehingga narasi & tabel harus ' +
      'dipecah per kota selain gabungan provinsi (lihat notulen rapat).',
    terverifikasi: false,
  },
  9100: {
    kodeWilayah: '9100',
    nama: 'Papua Barat',
    namaLengkap: 'Provinsi Papua Barat',
    jumlahKotaIHK: 1,
    kotaIHK: ['Manokwari'],
    brsNomorPrefix: '91',
    terverifikasi: false,
  },
  9200: {
    kodeWilayah: '9200',
    nama: 'Papua Barat Daya',
    namaLengkap: 'Provinsi Papua Barat Daya',
    jumlahKotaIHK: 1,
    kotaIHK: ['Sorong'],
    brsNomorPrefix: '92',
    terverifikasi: false,
  },
};

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve info DOB. Jika `namaKotaFromData` tersedia (dibaca langsung dari
 * kolom "Nama Kota" file yang diunggah), namaLengkap ditimpa nilai tsb
 * supaya selalu akurat walau tabel statis di atas belum lengkap/salah.
 */
function resolveDOB(kodeWilayah, namaKotaFromData = null) {
  const key = String(kodeWilayah);
  const base = DOB[key] || {
    kodeWilayah: key,
    nama: namaKotaFromData ? titleCase(namaKotaFromData.replace(/^PROV\s+/i, '')) : `Wilayah ${key}`,
    namaLengkap: namaKotaFromData ? namaLengkapFromRaw(namaKotaFromData) : `Wilayah ${key}`,
    jumlahKotaIHK: 1,
    kotaIHK: [],
    brsNomorPrefix: key.slice(0, 2),
    terverifikasi: false,
  };
  if (namaKotaFromData) {
    return { ...base, namaLengkap: namaLengkapFromRaw(namaKotaFromData), namaLengkapSumber: 'data' };
  }
  return { ...base, namaLengkapSumber: 'registry' };
}

/**
 * "PROV PAPUA PEGUNUNGAN" -> "Provinsi Papua Pegunungan" (bukan cuma
 * title-case literal "Prov Papua Pegunungan").
 */
function namaLengkapFromRaw(raw) {
  const withoutProv = String(raw).replace(/^PROV\.?\s+/i, '');
  return `Provinsi ${titleCase(withoutProv)}`;
}

function listDOB() {
  return Object.values(DOB);
}

function upsertDOB(kodeWilayah, patch) {
  const key = String(kodeWilayah);
  DOB[key] = { ...(DOB[key] || {}), ...patch, kodeWilayah: key };
  return DOB[key];
}

/**
 * 4 jenis berkas keluaran per DOB, sesuai kesimpulan rapat.
 */
const OUTPUT_KINDS = [
  { id: 'narasi', label: 'Naskah narasi (.docx)', ext: 'docx' },
  { id: 'indesign', label: 'Paket InDesign (.idml)', ext: 'idml' },
  { id: 'infografis', label: 'Infografis halaman akhir (.svg + .png)', ext: 'svg' },
  { id: 'pdf', label: 'Pratinjau cetak (.pdf)', ext: 'pdf' },
];

module.exports = { DOB, resolveDOB, listDOB, upsertDOB, OUTPUT_KINDS };
