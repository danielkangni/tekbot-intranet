const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getUserByEmail, getUserById, getDb } = require('../db/database');

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  req.session.userId = user.id;
  req.session.userRole = user.role;

  res.json({
    success: true,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      specialization: user.specialization, character_id: user.character_id,
      level: user.level, xp: user.xp, onboarding_complete: user.onboarding_complete,
      avatar_initial: user.avatar_initial
    },
    redirect: user.onboarding_complete ? '/dashboard.html' : '/onboarding.html'
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  const user = await getUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const db = getDb();
  const levelConf = await db.get('SELECT * FROM level_config WHERE level = ?', [user.level]);
  const nextLevel = await db.get('SELECT * FROM level_config WHERE level = ?', [user.level + 1]);
  let managedProjects = [];
  try {
    managedProjects = await db.all('SELECT id, title FROM projects WHERE project_manager_id = ?', [user.id]);
  } catch(e) { /* column may not exist yet */ }

  res.json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    specialization: user.specialization, character_id: user.character_id,
    level: user.level, xp: user.xp, onboarding_complete: user.onboarding_complete,
    avatar_initial: user.avatar_initial,
    level_title: levelConf?.title || 'Apprenti',
    xp_for_next: nextLevel?.xp_required || null,
    is_project_manager: managedProjects.length > 0,
    managed_projects: managedProjects
  });
});

// Complete onboarding
router.post('/onboarding', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  const { specialization } = req.body;

  const characterMap = { '3d': 'kaseki', 'electronics': 'chrome', 'it': 'senku' };
  const character = characterMap[specialization];
  if (!character) return res.status(400).json({ error: 'Spécialisation invalide' });

  const db = getDb();
  await db.run(
    'UPDATE users SET specialization = ?, character_id = ?, onboarding_complete = 1 WHERE id = ?',
    [specialization, character, req.session.userId]
  );

  const activities = await db.all(
    `SELECT id, start_time, end_time FROM activities WHERE target_specialization IS NULL OR target_specialization = ?`,
    [specialization]
  );

  for (const a of activities) {
    await db.run(
      `INSERT OR IGNORE INTO user_activities (user_id, activity_id, scheduled_start, scheduled_end) VALUES (?, ?, ?, ?)`,
      [req.session.userId, a.id, a.start_time, a.end_time]
    );
  }

  res.json({ success: true, character_id: character, specialization });
});

module.exports = router;
