const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseBRSWorkbook } = require('../services/excelParser');
const { createSession } = require('../services/sessionStore');
const { listDOB } = require('../config/dob');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'storage', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Hanya file .xlsx yang diterima.'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * POST /api/upload
 * Terima SATU file Excel (hasil pivot ATAU dataset mentah -- keduanya
 * didukung, lihat services/excelParser.js), lalu kembalikan ringkasan yang
 * ditampilkan pada panel Step 1 frontend ("Ringkasan yang terbaca").
 *
 * Body (multipart/form-data):
 *   file           - file .xlsx (wajib)
 *   bulan, tahun   - override periode manual (opsional, prioritas di atas
 *                    deteksi otomatis dari file)
 *   kodeWilayah    - override kode DOB manual (opsional)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'File Excel tidak ditemukan pada request.' });
  }

  try {
    const parsed = await parseBRSWorkbook(req.file.path, req.file.originalname);

    const session = createSession({
      step: 1,
      status: 'uploaded',
      uploadedFile: {
        originalName: req.file.originalname,
        storedPath: req.file.path,
        size: req.file.size,
        sheetNamesFound: parsed.sheetNamesFound,
        format: parsed.format,
      },
      parsedData: parsed,
      userInput: {
        bulan: req.body.bulan || null,
        tahun: req.body.tahun || null,
        kodeWilayah: req.body.kodeWilayah || null,
      },
    });

    res.json({
      ok: true,
      sessionId: session.id,
      format: parsed.format,
      formatLabel:
        parsed.format === 'pivot'
          ? 'Sudah berisi pivot table (Pivot/Kelompok/Subkelompok)'
          : 'Data mentah (DATASET) -- backend membangun pivot otomatis',
      sheetCount: parsed.sheetNamesFound.length,
      sheetNamesFound: parsed.sheetNamesFound,
      ringkasan: {
        ihkUmum: parsed.umum.ihk,
        infYoy: parsed.umum.infYoy,
        infMoM: parsed.umum.infMoM,
        infYtd: parsed.umum.infYtd,
      },
      kelompokTerpetakan: parsed.kelompok.length,
      totalKelompokBaku: 11,
      meta: parsed.meta,
      dobOptions: listDOB(),
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/upload/:sessionId/periode
 * Lengkapi/koreksi periode & wilayah secara manual (dipakai bila file
 * berbentuk "sudah dipivot" yang tidak menyimpan info bulan/tahun/wilayah).
 */
router.patch('/upload/:sessionId/periode', (req, res) => {
  const { getSession, updateSession } = require('../services/sessionStore');
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });

  const userInput = {
    ...session.userInput,
    bulan: req.body.bulan ?? session.userInput.bulan,
    tahun: req.body.tahun ?? session.userInput.tahun,
    kodeWilayah: req.body.kodeWilayah ?? session.userInput.kodeWilayah,
    namaWilayah: req.body.namaWilayah ?? session.userInput.namaWilayah,
  };
  updateSession(session.id, { userInput });
  res.json({ ok: true, userInput });
});

module.exports = router;
