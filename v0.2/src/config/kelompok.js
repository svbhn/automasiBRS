/**
 * Daftar 11 kelompok pengeluaran (COICOP) sesuai (2022=100) dan urutan subbab
 * 1.1 - 1.11 pada BRS IHK, diambil dari struktur nyata file BRS contoh.
 *
 * kode: kode 2 digit sesuai kolom "Kode"/"Kelompok" pada sheet DATASET.
 * label: label baku sesuai penulisan BRS (Title Case, dipakai di narasi).
 * labelUpper: label sesuai Tabel 1 (UPPERCASE, dipakai di sheet Kelompok).
 */

const KELOMPOK = [
  {
    kode: '01',
    subbab: '1.1',
    label: 'Makanan, Minuman, dan Tembakau',
    labelUpper: 'MAKANAN, MINUMAN DAN TEMBAKAU',
    infografisLabel: 'Makanan,\nMinuman &\nTembakau',
    ikon: 'food',
  },
  {
    kode: '02',
    subbab: '1.2',
    label: 'Pakaian dan Alas Kaki',
    labelUpper: 'PAKAIAN DAN ALAS KAKI',
    infografisLabel: 'Pakaian &\nAlas Kaki',
    ikon: 'clothing',
  },
  {
    kode: '03',
    subbab: '1.3',
    label: 'Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga',
    labelUpper: 'PERUMAHAN, AIR, LISTRIK, DAN BAHAN BAKAR RUMAH TANGGA',
    infografisLabel: 'Perumahan,\nAir, Listrik &\nBahan Bakar\nRumah Tangga',
    ikon: 'housing',
  },
  {
    kode: '04',
    subbab: '1.4',
    label: 'Perlengkapan, Peralatan, dan Pemeliharaan Rutin Rumah Tangga',
    labelUpper: 'PERLENGKAPAN, PERALATAN DAN PEMELIHARAAN RUTIN RUMAH TANGGA',
    infografisLabel: 'Perlengkapan,\nPeralatan &\nPemeliharaan\nRutin\nRumah Tangga',
    ikon: 'household',
  },
  {
    kode: '05',
    subbab: '1.5',
    label: 'Kesehatan',
    labelUpper: 'KESEHATAN',
    infografisLabel: 'Kesehatan',
    ikon: 'health',
  },
  {
    kode: '06',
    subbab: '1.6',
    label: 'Transportasi',
    labelUpper: 'TRANSPORTASI',
    infografisLabel: 'Transportasi',
    ikon: 'transport',
  },
  {
    kode: '07',
    subbab: '1.7',
    label: 'Informasi, Komunikasi, dan Jasa Keuangan',
    labelUpper: 'INFORMASI, KOMUNIKASI, DAN JASA KEUANGAN',
    infografisLabel: 'Informasi,\nKomunikasi &\nJasa Keuangan',
    ikon: 'info',
  },
  {
    kode: '08',
    subbab: '1.8',
    label: 'Rekreasi, Olahraga, dan Budaya',
    labelUpper: 'REKREASI, OLAHRAGA, DAN BUDAYA',
    infografisLabel: 'Rekreasi,\nOlahraga\n& Budaya',
    ikon: 'recreation',
  },
  {
    kode: '09',
    subbab: '1.9',
    label: 'Pendidikan',
    labelUpper: 'PENDIDIKAN',
    infografisLabel: 'Pendidikan',
    ikon: 'education',
  },
  {
    kode: '10',
    subbab: '1.10',
    label: 'Penyediaan Makanan dan Minuman/Restoran',
    labelUpper: 'PENYEDIAAN MAKANAN DAN MINUMAN/RESTORAN',
    infografisLabel: 'Penyediaan\nMakanan &\nMinuman/\nRestoran',
    ikon: 'restaurant',
  },
  {
    kode: '11',
    subbab: '1.11',
    label: 'Perawatan Pribadi dan Jasa Lainnya',
    labelUpper: 'PERAWATAN PRIBADI DAN JASA LAINNYA',
    infografisLabel: 'Perawatan\nPribadi &\nJasa Lainnya',
    ikon: 'personal',
  },
];

const UMUM_KODE = '0';

function findKelompok(kode) {
  const k = String(kode).padStart(2, '0');
  return KELOMPOK.find((x) => x.kode === k) || null;
}

module.exports = { KELOMPOK, UMUM_KODE, findKelompok };
