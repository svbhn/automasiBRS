/**
 * Wiring frontend <-> backend Otomasi BRS.
 * Tidak mengubah desain/struktur visual frontend.html -- hanya mengisi data
 * nyata ke elemen yang sudah diberi id, dan memanggil endpoint REST backend.
 */
(function () {
  const API = ''; // sama origin (server.js menyajikan frontend & API bersamaan)
  let state = { sessionId: null, parsed: null, pollTimer: null };

  const BULAN_LIST = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  /**
   * Modal popup kustom menggantikan alert()/confirm() bawaan browser
   * (yang tampil sebagai dialog OS polos "localhost:4000 says..."). Dipakai
   * di seluruh notifikasi kesalahan/peringatan/sukses pada wizard.
   *
   * showModal(message, { title, type, onOk, showCancel, onCancel })
   * type: 'error' | 'success' | 'info'
   */
  function showModal(message, opts = {}) {
    const { title, type = 'info', onOk, showCancel = false, onCancel, okLabel = 'OK', cancelLabel = 'Batal' } = opts;

    const defaultTitle = { error: 'Terjadi kesalahan', success: 'Berhasil', info: 'Pemberitahuan' }[type];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" role="alertdialog" aria-modal="true">
        <p class="modal-title ${type}">${escapeHtmlGlobal(title || defaultTitle)}</p>
        <p class="modal-message">${escapeHtmlGlobal(message)}</p>
        <div class="modal-actions">
          ${showCancel ? `<button class="modal-btn-cancel" data-action="cancel">${escapeHtmlGlobal(cancelLabel)}</button>` : ''}
          <button class="modal-btn-ok" data-action="ok">${escapeHtmlGlobal(okLabel)}</button>
        </div>
      </div>`;

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(); // klik area luar box = tutup
    });
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
      close();
      if (onOk) onOk();
    });
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        close();
        if (onCancel) onCancel();
      });
    }

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-btn-ok').focus();
    return { close };
  }
  window.showModal = showModal; // tersedia global bila dibutuhkan elemen lain

  function escapeHtmlGlobal(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const bulanSelect = document.getElementById('input-bulan');
    if (bulanSelect) {
      bulanSelect.innerHTML = BULAN_LIST.map((b, i) => `<option value="${i + 1}">${b}</option>`).join('');
    }
    loadDobOptions();

    const fileInput = document.getElementById('file-input');
    const dropzone = document.getElementById('dropzone');
    const browseBtn = document.getElementById('browse-btn');
    if (dropzone) dropzone.addEventListener('click', () => fileInput.click());
    if (browseBtn) browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    if (fileInput) fileInput.addEventListener('change', onFileSelected);

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          fileInput.files = e.dataTransfer.files;
          onFileSelected();
        }
      });
    }

    ['input-bulan', 'input-tahun', 'input-wilayah'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', syncPeriodeToServer);
    });
  }

  async function loadDobOptions() {
    try {
      const res = await fetch(`${API}/api/dob`);
      const json = await res.json();
      const sel = document.getElementById('input-wilayah');
      if (sel && json.ok) {
        sel.innerHTML = json.data
          .map((d) => `<option value="${d.kodeWilayah}">${d.namaLengkap}${d.terverifikasi ? '' : ' (belum terverifikasi)'}</option>`)
          .join('');
      }
    } catch (e) {
      console.warn('Gagal memuat daftar DOB', e);
    }
  }

  async function onFileSelected() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    if (!file) return;

    document.getElementById('fname').textContent = file.name;
    document.getElementById('fsub').textContent = `Mengunggah… (${(file.size / 1024).toFixed(1)} KB)`;

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: form });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      state.sessionId = json.sessionId;

      document.getElementById('fsub').textContent = `${json.sheetCount} sheet · ${(file.size / 1024).toFixed(1)} KB · ${json.formatLabel}`;
      document.getElementById('upload-desc').innerHTML =
        json.format === 'pivot'
          ? 'Sistem membaca sheet <b>Pivot/Kelompok/Subkelompok</b> yang sudah tersedia pada file ini.'
          : 'Sistem membaca sheet <b>DATASET</b> mentah dan membangun pivot table secara otomatis (kode 1/2/3/7 digit).';

      document.getElementById('sum-ihk').textContent = fmt(json.ringkasan.ihkUmum);
      document.getElementById('sum-yoy').textContent = fmt(json.ringkasan.infYoy) + '%';
      document.getElementById('sum-mom').textContent = fmt(json.ringkasan.infMoM) + '%';
      document.getElementById('sum-ytd').textContent = fmt(json.ringkasan.infYtd) + '%';

      // Tampilkan field periode manual bila tidak lengkap otomatis dari file
      const needManual = !json.meta || !json.meta.bulan || !json.meta.tahun;
      const periodeFields = document.getElementById('periode-fields');
      if (periodeFields) {
        periodeFields.style.display = 'grid';
        if (json.meta && json.meta.bulan) document.getElementById('input-bulan').value = String(parseInt(json.meta.bulan, 10));
        if (json.meta && json.meta.tahun) document.getElementById('input-tahun').value = json.meta.tahun;
        if (json.meta && json.meta.kodeWilayah) document.getElementById('input-wilayah').value = json.meta.kodeWilayah;
      }

      document.getElementById('btn-to-step2').disabled = false;
    } catch (err) {
      document.getElementById('fsub').textContent = `Gagal: ${err.message}`;
      showModal(err.message, { title: 'Upload gagal', type: 'error' });
    }
  }

  async function syncPeriodeToServer() {
    if (!state.sessionId) return;
    const bulan = document.getElementById('input-bulan').value;
    const tahun = document.getElementById('input-tahun').value;
    const kodeWilayah = document.getElementById('input-wilayah').value;
    await fetch(`${API}/api/upload/${state.sessionId}/periode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulan, tahun, kodeWilayah }),
    });
  }

  window.proceedToMapping = async function () {
    if (!state.sessionId) return showModal('Unggah file Excel terlebih dahulu sebelum lanjut.', { title: 'Belum ada file', type: 'error' });
    await syncPeriodeToServer();
    goTo(2);
    await loadMapping();
  };

  async function loadMapping() {
    const container = document.getElementById('map-rows');
    const note = document.getElementById('mapping-note');
    container.innerHTML = '<div class="map-row"><div class="narasi-cell">Memuat pemetaan…</div></div>';

    try {
      const res = await fetch(`${API}/api/mapping/${state.sessionId}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      container.innerHTML = json.rows
        .map(
          (r) => `<div class="map-row">
        <div class="pivot-cell">
          <div class="lbl">${escapeHtml(r.sumber)}</div>
          <div class="val">${escapeHtml(r.nilai)}</div>
        </div>
        <div class="arrow"><svg width="24" height="18" viewBox="0 0 24 18" fill="none"><path d="M0 9H22M22 9L15 2M22 9L15 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="narasi-cell">${escapeHtml(r.narasi)}</div>
      </div>`
        )
        .join('');

      if (json.perluTinjauan && json.perluTinjauan.length > 0) {
        note.style.display = 'block';
        note.innerHTML =
          `<b>${json.perluTinjauan.length} kelompok memerlukan pemeriksaan manual:</b> ` +
          json.perluTinjauan.map((f) => `${escapeHtml(f.kelompok)} (${escapeHtml(f.alasan.join('; '))})`).join(' &middot; ');
      } else {
        note.style.display = 'none';
      }

      document.querySelector('#panel-2 .status-pill').textContent = `${json.kelompokTerpetakan} / ${json.totalKelompokBaku} kelompok terpetakan`;
    } catch (err) {
      container.innerHTML = `<div class="map-row"><div class="narasi-cell">Gagal memuat pemetaan: ${escapeHtml(err.message)}</div></div>`;
    }
  }

  window.startRender = async function () {
    if (!state.sessionId) return showModal('Unggah file Excel terlebih dahulu sebelum lanjut.', { title: 'Belum ada file', type: 'error' });
    goTo(3);
    document.getElementById('btn-see-result').disabled = true;

    try {
      await fetch(`${API}/api/render/${state.sessionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      pollRenderStatus();
    } catch (err) {
      showModal(err.message, { title: 'Gagal memulai render', type: 'error' });
    }
  };

  function pollRenderStatus() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/render/${state.sessionId}/status`);
        const json = await res.json();
        renderProgress(json);
        if (json.status === 'done') {
          clearInterval(state.pollTimer);
          document.getElementById('btn-see-result').disabled = false;
        }
        if (json.status === 'error') {
          clearInterval(state.pollTimer);
          showModal(json.error, { title: 'Render gagal', type: 'error' });
        }
      } catch (e) {
        console.warn('poll error', e);
      }
    }, 900);
  }

  function renderProgress(json) {
    const list = document.getElementById('render-list');
    if (list) {
      list.innerHTML = json.progress
        .map((p) => {
          const dotClass = p.status === 'done' ? '' : p.status === 'running' ? 'spin' : 'pending';
          const dotSymbol = p.status === 'done' ? '✓' : p.status === 'running' ? '↻' : '•';
          const time = p.status === 'done' ? p.time : p.status === 'running' ? 'berjalan…' : 'menunggu';
          return `<li><div class="r-dot ${dotClass}">${dotSymbol}</div><div class="r-label">${escapeHtml(p.label)}</div><div class="r-time">${time}</div></li>`;
        })
        .join('');
    }
    const fill = document.getElementById('progress-fill');
    const percentEl = document.getElementById('progress-percent');
    const textEl = document.getElementById('progress-text');
    if (fill) fill.style.width = `${json.percent}%`;
    if (percentEl) percentEl.textContent = `${json.percent}%`;
    if (textEl) {
      const running = json.progress.find((p) => p.status === 'running');
      textEl.textContent = running ? running.label : json.status === 'done' ? 'Selesai' : 'Memulai…';
    }
  }

  window.goToResult = async function () {
    goTo(4);
    await loadDownloadInfo();
  };

  async function loadDownloadInfo() {
    const grid = document.getElementById('output-grid');
    try {
      const res = await fetch(`${API}/api/download/${state.sessionId}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      const ICON = { narasi: 'DOC', indesign: 'IDML', infografis: 'SVG', gambar1: 'SVG', pdf: 'PDF' };
      grid.innerHTML = json.files
        .map(
          (f) => `<div class="output-card">
        <div class="output-top">
          <div class="out-ico ${f.kind}">${ICON[f.kind] || 'FILE'}</div>
          <div>
            <div class="fname">${escapeHtml(f.filename)}</div>
            <div class="fsub">${f.sizeBytes ? (f.sizeBytes / 1024).toFixed(1) + ' KB' : ''}</div>
          </div>
        </div>
        <div class="output-actions">
          <a class="btn-download" style="text-decoration:none;display:inline-block;" href="${f.url}">Unduh</a>
        </div>
      </div>`
        )
        .join('');

      document.querySelector('#panel-4 p').textContent = `BRS IHK ${json.dob ? json.dob.namaLengkap : ''} ${json.periode || ''} siap diperiksa editor sebelum naik cetak.`;
      const zipLink = document.getElementById('zip-download-link');
      if (zipLink) zipLink.href = json.zipUrl;

      if (json.kelompokPerluTinjauan && json.kelompokPerluTinjauan.length > 0) {
        const note = document.createElement('div');
        note.className = 'note-box';
        note.style.marginTop = '14px';
        note.innerHTML = `<b>Ingat:</b> ${json.kelompokPerluTinjauan.length} kelompok masih perlu ditinjau manual sebelum naik cetak: ${json.kelompokPerluTinjauan.join(', ')}.`;
        grid.after(note);
      }
    } catch (err) {
      grid.innerHTML = `<div class="output-card">Gagal memuat berkas: ${escapeHtml(err.message)}</div>`;
    }
  }

  function fmt(n) {
    if (n === null || n === undefined) return '-';
    return Number(n).toFixed(2).replace('.', ',');
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
