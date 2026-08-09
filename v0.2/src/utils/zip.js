const archiver = require('archiver');

/**
 * Bungkus daftar { name, path } menjadi satu ZIP dan tulis langsung ke
 * response stream Express (dipakai endpoint "unduh semua berkas").
 */
function streamZipToResponse(res, zipFilename, fileList) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    res.status(500).end(String(err));
  });
  archive.pipe(res);
  for (const f of fileList) {
    archive.file(f.path, { name: f.name });
  }
  archive.finalize();
}

module.exports = { streamZipToResponse };
