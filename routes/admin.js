const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middleware/auth');
const { getDb, getUserById } = require('../db/database');

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  const users = await getDb().all('SELECT id, name, email, role, specialization, character_id, level, xp, onboarding_complete, avatar_initial, created_at FROM users ORDER BY created_at DESC');
  res.json(users);
});

// Create user
router.post('/users', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });

  const db = getDb();
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });

  const hash = bcrypt.hashSync(password, 10);
  const initial = name.charAt(0).toUpperCase();
  const result = await db.run(
    'INSERT INTO users (name, email, password, role, avatar_initial) VALUES (?, ?, ?, ?, ?)',
    [name, email, hash, role || 'member', initial]
  );

  res.json({ success: true, id: result.lastID });
});

// Update user
router.put('/users/:id', requireAdmin, async (req, res) => {
  const { name, email, role, specialization, level, xp } = req.body;
  const db = getDb();

  const characterMap = { '3d': 'kaseki', 'electronics': 'chrome', 'it': 'senku' };
  const character = characterMap[specialization] || null;

  await db.run(
    'UPDATE users SET name=?, email=?, role=?, specialization=?, character_id=?, level=?, xp=? WHERE id=?',
    [name, email, role, specialization || null, character, level || 1, xp || 0, req.params.id]
  );

  res.json({ success: true });
});

// Reset user password
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Mot de passe requis' });

  const hash = bcrypt.hashSync(password, 10);
  await getDb().run('UPDATE users SET password = ? WHERE id = ?', [hash, req.params.id]);
  res.json({ success: true });
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  if (req.params.id == req.session.userId) return res.status(400).json({ error: 'Vous ne pouvez pas vous supprimer vous-même' });

  const db = getDb();
  await db.run('DELETE FROM user_activities WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM video_progress WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM quiz_attempts WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM project_members WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM user_task_progress WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM user_skills WHERE user_id = ?', [req.params.id]);
  try { await db.run('UPDATE projects SET project_manager_id = NULL WHERE project_manager_id = ?', [req.params.id]); } catch(e) {}
  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);

  res.json({ success: true });
});

// Get theme
router.get('/theme', requireAdmin, async (req, res) => {
  const theme = await getDb().get('SELECT * FROM themes WHERE is_active = 1');
  if (!theme) return res.json({ config: {} });
  res.json({ ...theme, config: JSON.parse(theme.config) });
});

// Update theme
router.put('/theme', requireAdmin, async (req, res) => {
  const { name, config } = req.body;
  const db = getDb();
  const existing = await db.get('SELECT id FROM themes WHERE is_active = 1');

  if (existing) {
    await db.run('UPDATE themes SET name=?, config=? WHERE id=?', [name, JSON.stringify(config), existing.id]);
  } else {
    await db.run('INSERT INTO themes (name, config, is_active) VALUES (?, ?, 1)', [name, JSON.stringify(config)]);
  }

  res.json({ success: true });
});

// Get stats
router.get('/stats', requireAdmin, async (req, res) => {
  const db = getDb();
  const stats = {
    total_users: (await db.get("SELECT COUNT(*) as c FROM users WHERE role = 'member'")).c,
    onboarded: (await db.get("SELECT COUNT(*) as c FROM users WHERE onboarding_complete = 1 AND role = 'member'")).c,
    spec_3d: (await db.get("SELECT COUNT(*) as c FROM users WHERE specialization = '3d'")).c,
    spec_electronics: (await db.get("SELECT COUNT(*) as c FROM users WHERE specialization = 'electronics'")).c,
    spec_it: (await db.get("SELECT COUNT(*) as c FROM users WHERE specialization = 'it'")).c,
    total_projects: (await db.get('SELECT COUNT(*) as c FROM projects')).c,
    active_projects: (await db.get("SELECT COUNT(*) as c FROM projects WHERE status IN ('open','in_progress')")).c,
    total_videos: (await db.get('SELECT COUNT(*) as c FROM videos')).c,
    quizzes_passed: (await db.get('SELECT COUNT(*) as c FROM quiz_attempts WHERE passed = 1')).c,
    avg_level: (await db.get("SELECT AVG(level) as a FROM users WHERE role = 'member' AND onboarding_complete = 1")).a || 0
  };
  res.json(stats);
});

// Get skills
router.get('/skills', requireAdmin, async (req, res) => {
  const skills = await getDb().all('SELECT * FROM skills ORDER BY specialization, name');
  res.json(skills);
});

// Create skill
router.post('/skills', requireAdmin, async (req, res) => {
  const { name, description, specialization, icon } = req.body;
  const result = await getDb().run(
    'INSERT INTO skills (name, description, specialization, icon) VALUES (?, ?, ?, ?)',
    [name, description, specialization, icon || 'star']
  );
  res.json({ success: true, id: result.lastID });
});

// Award skill to user
router.post('/users/:userId/skills/:skillId', requireAdmin, async (req, res) => {
  await getDb().run(
    'INSERT OR IGNORE INTO user_skills (user_id, skill_id) VALUES (?, ?)',
    [req.params.userId, req.params.skillId]
  );
  res.json({ success: true });
});

module.exports = router;
