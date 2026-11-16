const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase, getActiveTheme } = require('./db/database');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const trainingRoutes = require('./routes/training');
const projectRoutes = require('./routes/projects');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB and start server
async function startServer() {
  await initDatabase();
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
  }));

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/training', trainingRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/admin', adminRoutes);

  // Theme endpoint
  app.get('/api/theme', async (req, res) => {
    const theme = await getActiveTheme();
    res.json(theme || getDefaultTheme());
  });

function getDefaultTheme() {
  return {
    primary: '#c3f5ff', primaryContainer: '#00e5ff', primaryFixedDim: '#00daf3',
    secondary: '#f4bb92', secondaryContainer: '#653d1e', tertiary: '#d2f5e0',
    background: '#111415', surface: '#111415',
    surfaceContainerLowest: '#0c0e10', surfaceContainerLow: '#1a1c1e',
    surfaceContainer: '#1e2022', surfaceContainerHigh: '#282a2c', surfaceContainerHighest: '#333537',
    onSurface: '#e0e3e4', onSurfaceVariant: '#bfc8ca',
    outline: '#849396', outlineVariant: '#3b494c', error: '#ffb4ab'
  };
}

  // Root redirect
  app.get('/', (req, res) => res.redirect('/login.html'));

  app.listen(PORT, () => {
    console.log(`\n🔬 TekBot Intranet - Royaume de la Science`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`👤 Admin: admin@tekbot.fr (mot de passe : variable ADMIN_PASSWORD, ou affiché à la première initialisation)\n`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
