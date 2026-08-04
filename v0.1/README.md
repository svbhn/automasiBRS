# Otomasi BRS IHK — BPS Provinsi Papua

Backend Node.js/Express untuk otomasi penyusunan **Berita Resmi Statistik (BRS)
Indeks Harga Konsumen**, dibangun mengikuti hasil **Notulen Rapat Koordinasi
Kolaborasi BRS, IKK, Harga, dan IT — Juli 2026** dan menggunakan `frontend.html`
+ `styles.css` yang sudah disediakan (4 langkah: Upload → Pemetaan → Render →
Unduh).

## Menjalankan

```bash
cd backend
npm install
npm start          # server di http://localhost:4000
# atau untuk auto-reload saat development:
npm run dev
```

Buka `http://localhost:4000` — frontend wizard sudah tersaji dari server yang
sama (tidak perlu server terpisah untuk frontend).

## Alur 4 langkah (sesuai frontend)

1. **Upload** (`POST /api/upload`) — unggah SATU file `.xlsx`. Backend
   mendukung **dua bentuk file** sesuai notulen rapat:
   - File yang **sudah ada pivot table**-nya (sheet `Pivot`/`Kelompok`/
     `Subkelompok`) → dibaca langsung.
   - File **dataset mentah** (hanya sheet `DATASET`, kode 1/2/3/7-digit untuk
     Umum/Kelompok/Subkelompok/Komoditas) → backend **membangun pivot-nya
     sendiri** (agregasi & pengurutan Top-N andil, persis seperti pivot table
     Excel), termasuk breakdown komoditas dominan **per kelompok** yang tidak
     mungkin didapat dari file yang sudah dipivot.
2. **Pemetaan** (`GET /api/mapping/:sessionId`) — pratinjau setiap cell →
   kalimat baku BRS, plus daftar kelompok yang **perlu tinjauan manual** staf
   (subkelompok tidak lengkap, nilai mendekati nol, dsb.) — tidak pernah
   mengarang angka.
3. **Render** (`POST /api/render/:sessionId`, poll `GET
   /api/render/:sessionId/status`) — menyusun narasi 11 subbab (1.1–1.11),
   Tabel 1 & 2, Gambar 1, infografis, lalu mengekspor ke `.docx`, `.idml`,
   `.svg` (×2), `.pdf`.
4. **Unduh** (`GET /api/download/:sessionId`, `.../file/:kind`,
   `.../zip`) — 4+ berkas per DOB, bisa diunduh satu-satu atau sekaligus ZIP.

Endpoint pendukung: `GET/PUT /api/dob/:kode` (registry wilayah), `GET
/api/sessions` (riwayat, untuk dashboard).

## Keputusan desain penting (menjawab kendala di notulen rapat)

**"Belum menemukan cara edit script dengan file `.ai`, tapi bisa kalau `.png`
atau `.pdf`."** — Backend **tidak** mencoba membuat/mengedit `.ai` (format
biner proprietary Adobe tanpa SDK terbuka untuk Node.js). Sebagai gantinya,
infografis dan Gambar 1 dihasilkan sebagai **SVG** — format vektor terbuka
yang bisa langsung dibuka & diedit path/teksnya di Illustrator/InDesign
(File → Open/Place), sekaligus mudah dikonversi ke PNG/PDF oleh Tim IT (dua
format yang menurut mereka feasible).

**"Script bisa masukkan data dan narasi ke Indesign, tapi kadang format
berubah — perlu dirapikan manual."** — Backend menghasilkan **`.idml`**
(InDesign Markup Language): format XML resmi Adobe yang otomatis dibuka &
di-upgrade InDesign menjadi `.indd` saat File → Open. Ini persis mekanisme
yang didiskusikan Tim IT, tanpa mencoba memalsukan file `.indd` biner yang
tidak mungkin valid tanpa Adobe InDesign Server. Staf tetap perlu merapikan
tata letak (sesuai catatan notulen), tapi seluruh teks & angka sudah terisi
otomatis.

**"Akan ada 4 file untuk tiap DOB."** — Setiap render menghasilkan 4+ berkas:
naskah narasi (`.docx`), paket InDesign (`.idml`), infografis (`.svg`), dan
pratinjau cetak (`.pdf`), dibungkus per sesi/DOB dan bisa diunduh sekaligus
via endpoint ZIP.

**"Papua Tengah punya 2 kota inflasi."** — Registry DOB (`src/config/dob.js`)
sudah menandai kode `9300`/Papua Tengah dengan `jumlahKotaIHK: 2`. Nama
wilayah SELALU diprioritaskan dari kolom `Nama Kota` pada file yang diunggah
(bukan tabel statis) supaya tidak pernah salah walau registry belum lengkap —
lengkapi/koreksi lewat `PUT /api/dob/:kode`.

**Narasi tidak pernah mengarang angka.** Ketika data pendukung tidak
tersedia di file (subkelompok kosong karena pivot Excel di-collapse, atau
sheet Series kosong), kalimat terkait **dilewati**, bukan diisi placeholder
— divalidasi langsung terhadap sample `1__9400...xlsx` yang punya keterbatasan
ini secara nyata.

**Rotasi kata sambung "dan/serta/juga"** diimplementasikan deterministik
(`src/utils/numberFormat.js: kataSambung`) supaya kalimat panjang tidak
monoton tapi tetap reproducible untuk QA.

## Struktur proyek

```
backend/
├── server.js                     # entry point Express
├── src/
│   ├── config/
│   │   ├── dob.js                # registry 6 provinsi Papua (DOB)
│   │   └── kelompok.js           # 11 kelompok pengeluaran (subbab 1.1-1.11)
│   ├── routes/
│   │   ├── upload.js             # Step 1
│   │   ├── mapping.js            # Step 2
│   │   ├── render.js             # Step 3 (async job + polling)
│   │   ├── download.js           # Step 4 (single file + zip)
│   │   └── misc.js               # DOB registry & riwayat sesi
│   ├── services/
│   │   ├── excelParser.js        # dukung format pivot & dataset mentah
│   │   ├── seriesParser.js       # sheet Series -> Tabel 2 & tren
│   │   ├── narrativeEngine.js    # generator kalimat gaya BRS
│   │   ├── tableBuilder.js       # Tabel 1 & Tabel 2
│   │   ├── infographicBuilder.js # SVG Gambar 1 & infografis
│   │   ├── docxBuilder.js        # naskah .docx
│   │   ├── idmlBuilder.js        # paket InDesign .idml
│   │   ├── pdfBuilder.js         # pratinjau .pdf
│   │   ├── mappingBuilder.js     # pratinjau Step 2
│   │   ├── contextBuilder.js     # resolusi periode & wilayah
│   │   ├── renderPipeline.js     # orkestrator Step 3
│   │   └── sessionStore.js       # state sesi in-memory + snapshot disk
│   └── utils/
│       ├── numberFormat.js       # format angka gaya BPS (koma, ~0, dst.)
│       └── zip.js                # bundling ZIP unduhan
├── public/
│   ├── frontend.html             # frontend asli + id tambahan utk wiring
│   ├── styles.css                # asli, tidak diubah
│   └── app.js                    # wiring fetch() ke seluruh endpoint API
└── storage/
    ├── uploads/                  # file .xlsx yang diunggah
    ├── sessions/                 # snapshot JSON tiap sesi
    └── outputs/<sessionId>/      # berkas hasil render per sesi
```

## Keterbatasan yang jujur disampaikan (bukan disembunyikan)

- **Tabel 2 & tren 13 bulan** butuh sheet `Series Inflasi (2022=100)` terisi
  penuh. Jika kosong/sebagian, backend menandai bagian tsb sebagai belum
  lengkap alih-alih mengarang angka pembanding.
- **`.idml` bukan `.indd` jadi**. Tata letak dasarnya masih perlu dirapikan
  manual di InDesign (posisi frame, font, halaman) — ini konsisten dengan apa
  yang Tim IT sendiri sampaikan di notulen akan tetap diperlukan.
- **Kode wilayah DOB** (`91xx`–`96xx`) sebagian masih `terverifikasi: false`
  karena hanya kode 9400 & 9500 yang bisa dikonfirmasi langsung dari sample
  data yang diunggah. Mohon dikoreksi Tim Harga saat file DOB lain pertama
  kali diproses.
