const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * Penyimpan sesi sederhana (in-memory + snapshot ke disk) untuk melacak satu
 * proses pembuatan BRS mengikuti 4 langkah pada frontend:
 *   1 Upload Excel  -> 2 Pemetaan  -> 3 Render  -> 4 Unduh berkas
 *
 * Untuk deployment produksi jangka panjang, ganti dengan Redis/DB; struktur
 * ini cukup untuk single-instance backend seperti diminta pada notulen tahap
 * awal kolaborasi ("kolaborasi ini akan menghasilkan script/program web").
 */

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'storage', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const sessions = new Map();

function createSession(initial = {}) {
  const id = uuidv4();
  const session = {
    id,
    step: 1,
    status: 'uploaded',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...initial,
  };
  sessions.set(id, session);
  persist(session);
  return session;
}

function getSession(id) {
  if (sessions.has(id)) return sessions.get(id);
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    sessions.set(id, data);
    return data;
  }
  return null;
}

function updateSession(id, patch) {
  const session = getSession(id);
  if (!session) return null;
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
  sessions.set(id, session);
  persist(session);
  return session;
}

function persist(session) {
  // Simpan versi ringan tanpa buffer besar (file Excel mentah, dsb.) supaya
  // snapshot JSON tetap ringan; buffer disimpan terpisah di folder outputs.
  const light = { ...session };
  delete light._workbookBuffer;
  fs.writeFileSync(path.join(SESSIONS_DIR, `${session.id}.json`), JSON.stringify(light, null, 2));
}

function listSessions() {
  return [...sessions.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = { createSession, getSession, updateSession, listSessions };
