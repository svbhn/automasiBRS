function buildCsv(parsedData) {
  let csv = "Kode,Kelompok,IHK,Inflasi YoY,Inflasi MoM,Inflasi YtD,Andil\n";
  
  if (parsedData.umum) {
    csv += `0,Umum,${parsedData.umum.ihk || ''},${parsedData.umum.infYoy || ''},${parsedData.umum.infMoM || ''},${parsedData.umum.infYtd || ''},\n`;
  }
  
  if (parsedData.kelompok && Array.isArray(parsedData.kelompok)) {
    for (const k of parsedData.kelompok) {
      const nama = k.nama || k.labelUpper || '';
      csv += `${k.kode || ''},"${nama.replace(/"/g, '""')}",${k.ihk || ''},${k.infYoy || ''},${k.infMoM || ''},${k.infYtd || ''},${k.andil || ''}\n`;
    }
  }
  
  return Buffer.from(csv, 'utf8');
}

module.exports = { buildCsv };
