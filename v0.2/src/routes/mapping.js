const express = require('express');
const { getSession, updateSession } = require('../services/sessionStore');
const { buildMappingPreview } = require('../services/mappingBuilder');

const router = express.Router();

/**
 * GET /api/mapping/:sessionId
 * Kembalikan pratinjau pemetaan cell pivot -> kalimat baku untuk panel
 * Step 2 frontend, termasuk daftar kelompok yang perlu tinjauan manual.
 */
router.get('/mapping/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesi tidak ditemukan.' });
  if (!session.parsedData) {
    return res.status(400).json({ ok: false, error: 'Sesi belum memiliki data ter-parse. Ulangi upload.' });
  }

  const mapping = buildMappingPreview(session.parsedData);
  updateSession(session.id, { step: 2, status: 'mapped', mapping });

  res.json({ ok: true, sessionId: session.id, ...mapping });
});

module.exports = router;
