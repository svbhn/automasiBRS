const express = require('express');
const path = require('path');
const fs = require('fs');
const { getSession } = require('../services/sessionStore');
const { streamZipToResponse } = require('../utils/zip');

const router = express.Router();

/**
 * GET /api/download/:sessionId
 * Daftar berkas keluaran siap unduh (panel Step 4 frontend: kartu .idml
 * & .pdf, plus tambahan narasi .docx & infografis .svg sesuai 4 jenis
 * berkas per DOB yang disepakati pada notulen rapat).
 */
router.get('/download/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (session.status !== 'done' || !session.files) {
    return res.status(409).json({ ok: false, error: 'Render belum selesai untuk sesi ini.' });
  }

  const entries = Object.entries(session.files).map(([kind, filename]) => {
    const filePath = path.join(session.outDir, filename);
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    return {
      kind,
      filename,
      sizeBytes: stat ? stat.size : null,
      url: `/api/download/${session.id}/file/${kind}`,
    };
  });

  res.json({
    ok: true,
    sessionId: session.id,
    baseName: session.baseName,
    dob: session.ctx?.dob,
    periode: session.ctx ? `${session.ctx.bulanNow} ${session.ctx.tahunNow}` : null,
    ringkasanAngka: session.ringkasanAngka,
    kelompokPerluTinjauan: session.kelompokPerluTinjauan || [],
    files: entries,
    zipUrl: `/api/download/${session.id}/zip`,
  });
});

/**
 * GET /api/download/:sessionId/file/:kind
 * Unduh satu berkas (kind: narasi | indesign | infografis | gambar1 | pdf).
 */
router.get('/download/:sessionId/file/:kind', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session || session.status !== 'done') {
    return res.status(404).json({ ok: false, error: 'Berkas tidak ditemukan.' });
  }
  const filename = session.files[req.params.kind];
  if (!filename) return res.status(404).json({ ok: false, error: `Jenis berkas "${req.params.kind}" tidak dikenal.` });

  const filePath = path.join(session.outDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'File fisik tidak ditemukan di server.' });

  res.download(filePath, filename);
});

/**
 * GET /api/download/:sessionId/zip
 * Unduh seluruh 4+ berkas sekaligus dalam satu ZIP (memudahkan distribusi
 * "4 file per DOB" sesuai kesimpulan notulen rapat).
 */
router.get('/download/:sessionId/zip', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session || session.status !== 'done') {
    return res.status(404).json({ ok: false, error: 'Berkas tidak ditemukan.' });
  }

  const fileList = Object.values(session.files).map((filename) => ({
    name: filename,
    path: path.join(session.outDir, filename),
  }));

  streamZipToResponse(res, `${session.baseName}.zip`, fileList);
});

module.exports = router;
