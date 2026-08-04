const express = require('express');
const { getSession, updateSession } = require('../services/sessionStore');
const { runRenderJob, STEP_DEFINITIONS } = require('../services/renderPipeline');

const router = express.Router();

/**
 * POST /api/render/:sessionId
 * Memicu proses render (Step 3 frontend). Berjalan asinkron; progres dapat
 * dipantau lewat GET /api/render/:sessionId/status (dipoll oleh progress bar
 * "Menata artboard halaman ... / 64%" pada frontend).
 *
 * Body opsional: { nomorBRS } untuk menimpa nomor BRS otomatis.
 */
router.post('/render/:sessionId', async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (!session.parsedData) {
    return res.status(400).json({ ok: false, error: 'Sesi belum memiliki data ter-parse. Ulangi upload.' });
  }

  const userInput = {
    ...session.userInput,
    nomorBRS: req.body?.nomorBRS || session.userInput?.nomorBRS || null,
  };
  updateSession(session.id, { userInput });

  // Set status awal supaya GET status langsung punya progress list terisi
  // walau job belum sempat mengeksekusi langkah pertama.
  updateSession(session.id, {
    status: 'rendering',
    step: 3,
    progress: STEP_DEFINITIONS.map((s) => ({ ...s, status: 'pending', time: null })),
  });

  res.status(202).json({ ok: true, sessionId: session.id, message: 'Render dimulai.' });

  // Jalankan pipeline secara asinkron (tidak menahan response).
  runRenderJob(session.id, session.parsedData, session.uploadedFile.storedPath, userInput).catch((err) => {
    // sudah ditangani & disimpan sebagai status 'error' di dalam runRenderJob
    console.error(`[render:${session.id}]`, err.message);
  });
});

/**
 * GET /api/render/:sessionId/status
 * Dipoll oleh frontend untuk progress bar Step 3.
 */
router.get('/render/:sessionId/status', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });

  const progress = session.progress || [];
  const doneCount = progress.filter((p) => p.status === 'done').length;
  const percent = progress.length ? Math.round((doneCount / progress.length) * 100) : 0;

  res.json({
    ok: true,
    status: session.status,
    step: session.step,
    progress,
    percent,
    error: session.error || null,
    files: session.files || null,
  });
});

module.exports = router;
