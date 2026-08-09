const express = require('express');
const { listDOB, upsertDOB } = require('../config/dob');
const { listSessions } = require('../services/sessionStore');

const router = express.Router();

/** GET /api/dob - daftar wilayah DOB terdaftar (dipakai dropdown Step 1) */
router.get('/dob', (req, res) => {
  res.json({ ok: true, data: listDOB() });
});

/**
 * PUT /api/dob/:kode - lengkapi/koreksi info wilayah DOB (mis. saat file DOB
 * baru pertama kali diunggah dan kode wilayahnya belum ada di registry).
 */
router.put('/dob/:kode', (req, res) => {
  const updated = upsertDOB(req.params.kode, req.body);
  res.json({ ok: true, data: updated });
});

/**
 * GET /api/sessions - riwayat BRS untuk panel Dashboard ("Riwayat BRS").
 */
router.get('/sessions', (req, res) => {
  const sessions = listSessions().map((s) => ({
    id: s.id,
    status: s.status,
    step: s.step,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    periode: s.ctx ? `${s.ctx.bulanNow} ${s.ctx.tahunNow}` : null,
    wilayah: s.ctx?.dob?.nama || null,
    format: s.uploadedFile?.format || null,
  }));
  res.json({ ok: true, data: sessions });
});

module.exports = router;
