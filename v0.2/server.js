const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const uploadRoutes = require('./src/routes/upload');
const mappingRoutes = require('./src/routes/mapping');
const renderRoutes = require('./src/routes/render');
const downloadRoutes = require('./src/routes/download');
const miscRoutes = require('./src/routes/misc');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'otomasi-brs-backend', time: new Date().toISOString() });
});

app.use('/api', uploadRoutes);
app.use('/api', mappingRoutes);
app.use('/api', renderRoutes);
app.use('/api', downloadRoutes);
app.use('/api', miscRoutes);

// Sajikan frontend statis (frontend.html + styles.css) bila ada di /public,
// supaya seluruh sistem (frontend wizard + backend) bisa dijalankan dari
// satu proses Node untuk kemudahan demo/deploy internal BPS.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'frontend.html'));
});

// Error handler terpusat
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, () => {
  console.log(`Otomasi BRS backend berjalan di http://localhost:${PORT}`);
});
