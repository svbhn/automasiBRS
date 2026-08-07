const fs = require('fs');
const path = require('path');
const { buildNarrative } = require('./narrativeEngine');
const { buildTabel1, buildTabel2 } = require('./tableBuilder');
const { buildGambar1SVG, buildInfografisSVG } = require('./infographicBuilder');
const { buildSeriesHistory } = require('./seriesParser');
const { buildNarasiDocx } = require('./docxBuilder');
const { buildIdmlPackage } = require('./idmlBuilder');
const { buildPreviewPdf } = require('./pdfBuilder');
const { loadWorkbook } = require('./excelParser');
const { updateSession } = require('./sessionStore');

const OUTPUTS_DIR = path.join(__dirname, '..', '..', 'storage', 'outputs');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

/**
 * Daftar langkah yang ditampilkan di panel "Render naskah" (Step 3 frontend)
 * -- dipertahankan identik dengan render-list di frontend.html supaya UI
 * progress bar bisa mem-poll status ini secara langsung.
 */
const STEP_DEFINITIONS = [
  { id: 'validasi', label: 'Validasi kelompok pengeluaran terhadap sheet Kelompok & Subkelompok' },
  { id: 'ringkasan', label: 'Menyusun narasi ringkasan dan Tabel 1 (IHK & tingkat inflasi)' },
  { id: 'subbab', label: 'Menyusun narasi per kelompok (1.1 - 1.11)' },
  { id: 'artboard', label: 'Menata Gambar 1 & infografis, menyusun paket InDesign (.idml)' },
  { id: 'export', label: 'Memeriksa naskah & menyiapkan berkas unduhan (.docx/.idml/.svg/.pdf)' },
];

function nowLabel() {
  return new Date().toTimeString().slice(0, 5);
}

async function runRenderJob(sessionId, parsedData, workbookPath, userInput) {
  const progress = STEP_DEFINITIONS.map((s) => ({ ...s, status: 'pending', time: null }));
  updateSession(sessionId, { status: 'rendering', step: 3, progress });

  const setStepDone = (id) => {
    const p = progress.find((s) => s.id === id);
    if (p) {
      p.status = 'done';
      p.time = nowLabel();
    }
    updateSession(sessionId, { progress: [...progress] });
  };
  const setStepRunning = (id) => {
    const p = progress.find((s) => s.id === id);
    if (p) p.status = 'running';
    updateSession(sessionId, { progress: [...progress] });
  };

  try {
    const { buildContext } = require('./contextBuilder');

    setStepRunning('validasi');
    const ctx = buildContext(parsedData, userInput);
    const kelompokTerpetakan = parsedData.kelompok.length;
    const kelompokPerluTinjauan = parsedData.kelompok.filter((k) => {
      // tandai kelompok yang berubah tanda / tidak punya rincian subkelompok
      // sebagai "perlu tinjauan manual", mengikuti catatan Step 2 frontend.
      return !k.subkelompok || k.subkelompok.length === 0;
    });
    setStepDone('validasi');

    setStepRunning('ringkasan');
    const wb = await loadWorkbook(workbookPath);
    const seriesHistory = buildSeriesHistory(wb, ctx);
    const narrative = buildNarrative(parsedData, ctx, seriesHistory);
    const tabel1 = buildTabel1(parsedData, ctx);
    const tabel2 = buildTabel2(parsedData, ctx, seriesHistory);
    setStepDone('ringkasan');

    setStepRunning('subbab');
    // narrative.subbab sudah tersusun di buildNarrative; langkah ini murni
    // penanda progres agar konsisten dengan UI, tapi kita validasi tiap
    // subbab punya minimal 1 paragraf sebagai sanity check.
    for (const s of narrative.subbab) {
      if (!s.paragraf || s.paragraf.length === 0) {
        throw new Error(`Narasi subbab ${s.subbab} (${s.judul}) gagal disusun -- periksa data kelompok terkait.`);
      }
    }
    setStepDone('subbab');

    setStepRunning('artboard');
    const gambar1Svg = buildGambar1SVG(seriesHistory, ctx);
    const infografisSvg = buildInfografisSVG(parsedData, ctx, seriesHistory);
    const meta = {
      brsNomorPrefix: ctx.dob.brsNomorPrefix,
      nomorBRS: userInput.nomorBRS || null,
    };
    const idmlBuffer = await buildIdmlPackage({ narrative, ctx, meta });
    setStepDone('artboard');

    setStepRunning('export');
    const docxBuffer = await buildNarasiDocx({ narrative, tabel1, tabel2, ctx, meta });
    const pdfBuffer = await buildPreviewPdf({ narrative, tabel1, tabel2, ctx, meta, infografisSvg });

    const outDir = path.join(OUTPUTS_DIR, sessionId);
    fs.mkdirSync(outDir, { recursive: true });

    const baseName = `BRS_IHK_${slug(ctx.dob.nama)}_${ctx.bulanNow}${ctx.tahunNow}`;
    const files = {
      narasi: `${baseName}_narasi.docx`,
      indesign: `${baseName}.idml`,
      infografis: `${baseName}_infografis.svg`,
      gambar1: `${baseName}_gambar1.svg`,
      pdf: `${baseName}_preview.pdf`,
    };

    fs.writeFileSync(path.join(outDir, files.narasi), docxBuffer);
    fs.writeFileSync(path.join(outDir, files.indesign), idmlBuffer);
    fs.writeFileSync(path.join(outDir, files.infografis), infografisSvg);
    fs.writeFileSync(path.join(outDir, files.gambar1), gambar1Svg);
    fs.writeFileSync(path.join(outDir, files.pdf), pdfBuffer);
    fs.writeFileSync(path.join(outDir, `${baseName}_data.json`), JSON.stringify({ narrative, tabel1, tabel2, ctx }, null, 2));

    setStepDone('export');

    updateSession(sessionId, {
      status: 'done',
      step: 4,
      ctx,
      outDir,
      files,
      baseName,
      kelompokPerluTinjauan: kelompokPerluTinjauan.map((k) => k.labelUpper),
      ringkasanAngka: {
        ihk: parsedData.umum.ihk,
        infYoy: parsedData.umum.infYoy,
        infMoM: parsedData.umum.infMoM,
        infYtd: parsedData.umum.infYtd,
      },
    });

    return { ok: true, files, outDir };
  } catch (err) {
    updateSession(sessionId, { status: 'error', error: err.message });
    throw err;
  }
}

function slug(s) {
  return String(s)
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '');
}

module.exports = { runRenderJob, STEP_DEFINITIONS };
