const { tableCell, idNumber } = require('../utils/numberFormat');

/**
 * Tabel 1: IHK dan Tingkat Inflasi m-to-m, y-to-d, y-on-y Provinsi/Kota
 * menurut Kelompok Pengeluaran -- persis struktur tabel pada halaman 3 BRS.
 */
function buildTabel1(data, ctx) {
  const { namaBulanPrevYear, bulanPrevYear, tahunPrevYear, bulanDesemberLalu, tahunDesemberLalu } = ctx;
  const { ihkSebelum } = require('./narrativeEngine');

  const header = {
    kolomIhkSebelumnya: `IHK ${bulanPrevYear} ${tahunPrevYear}`,
    kolomIhkDesember: `IHK ${bulanDesemberLalu || 'Desember'} ${tahunDesemberLalu || tahunPrevYear}`,
    kolomIhkSekarang: `IHK ${ctx.bulanNow} ${ctx.tahunNow}`,
  };

  function rowFor(rec, labelDisplay) {
    const ihkPrevYear = ihkSebelum(rec.ihk, rec.infYoy);
    const ihkDesember = ihkSebelum(rec.ihk, rec.infYtd);
    return {
      label: labelDisplay,
      ihkPrevYear: ihkPrevYear !== null ? Number(ihkPrevYear.toFixed(2)) : null,
      ihkDesember: ihkDesember !== null ? Number(ihkDesember.toFixed(2)) : null,
      ihkSekarang: rec.ihk,
      infMoM: rec.infMoM,
      infYtd: rec.infYtd,
      infYoy: rec.infYoy,
      andilMoM: rec.andilMoM,
      andilYoy: rec.andilYoy,
      // versi string siap-cetak (memakai simbol ~0 dst.)
      display: {
        ihkPrevYear: ihkPrevYear !== null ? idNumber(ihkPrevYear) : '-',
        ihkDesember: ihkDesember !== null ? idNumber(ihkDesember) : '-',
        ihkSekarang: idNumber(rec.ihk),
        infMoM: tableCell(rec.infMoM),
        infYtd: tableCell(rec.infYtd),
        infYoy: tableCell(rec.infYoy),
        andilMoM: tableCell(rec.andilMoM),
        andilYoy: tableCell(rec.andilYoy),
      },
    };
  }

  const rows = [rowFor(data.umum, 'Umum (Headline)')];
  for (const k of data.kelompok) {
    const label = k.cfg ? k.cfg.label : titleCase(k.labelUpper);
    rows.push(rowFor(k, label));
  }

  return { header, rows, keterangan: KETERANGAN_TABEL1(ctx) };
}

function KETERANGAN_TABEL1(ctx) {
  return [
    `1) Persentase perubahan IHK ${ctx.bulanNow} ${ctx.tahunNow} terhadap IHK bulan sebelumnya,`,
    `2) Persentase perubahan IHK ${ctx.bulanNow} ${ctx.tahunNow} terhadap IHK ${ctx.bulanDesemberLalu || 'Desember'} ${ctx.tahunDesemberLalu || ctx.tahunPrevYear},`,
    `3) Persentase perubahan IHK ${ctx.bulanNow} ${ctx.tahunNow} terhadap IHK ${ctx.bulanPrevYear} ${ctx.tahunPrevYear},`,
    `~0 Data sangat kecil/mendekati nol`,
  ];
}

/**
 * Tabel 2: Tingkat Inflasi m-to-m, y-to-d, y-on-y provinsi untuk bulan yang
 * sama pada 3 tahun terakhir (kolom = tahun). Membutuhkan data historis dari
 * sheet Series; bila tidak lengkap, hanya kolom tahun berjalan yang terisi
 * dan kolom lain ditandai "-" (bukan diisi angka rekaan).
 */
function buildTabel2(data, ctx, seriesHistory) {
  const currentYear = ctx.tahunNow;
  const years = seriesHistory && seriesHistory.years ? seriesHistory.years : [currentYear];

  const rowDef = [
    { key: 'mom', label: 'Month to Month (m-to-m)', currentValue: data.umum.infMoM },
    { key: 'ytd', label: 'Year to Date (y-to-d)', currentValue: data.umum.infYtd },
    { key: 'yoy', label: 'Year on Year (y-on-y)', currentValue: data.umum.infYoy },
  ];

  const rows = rowDef.map((rd) => {
    const values = years.map((y) => {
      if (String(y) === String(currentYear)) return rd.currentValue;
      const hist = seriesHistory && seriesHistory[rd.key] ? seriesHistory[rd.key].find((h) => String(h.tahun) === String(y)) : null;
      return hist ? hist.nilai : null;
    });
    return {
      label: rd.label,
      values,
      display: values.map((v) => (v === null ? '-' : tableCell(v))),
    };
  });

  return { years, rows };
}

function titleCase(upper) {
  return String(upper)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { buildTabel1, buildTabel2 };
