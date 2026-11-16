const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserActivities, getUserById, getDb } = require('../db/database');

async function canManageActivities(userId, userRole) {
  if (userRole === 'admin') return true;
  const row = await getDb().get('SELECT id FROM projects WHERE project_manager_id = ?', [userId]);
  return !!row;
}

// Get schedule for current user
router.get('/', requireAuth, async (req, res) => {
  const activities = await getUserActivities(req.session.userId);
  res.json(activities);
});

// Move a flexible activity (reschedule by user)
router.patch('/:activityId/move', requireAuth, async (req, res) => {
  const { activityId } = req.params;
  const { new_start, new_end } = req.body;
  if (!new_start || !new_end) return res.status(400).json({ error: 'Créneau de début et fin requis' });

  const db = getDb();
  const activity = await db.get('SELECT * FROM activities WHERE id = ?', [activityId]);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable' });
  if (activity.is_mandatory) return res.status(403).json({ error: 'Cette activité est obligatoire et ne peut pas être déplacée' });

  await db.run(
    `INSERT INTO user_activities (user_id, activity_id, scheduled_start, scheduled_end)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, activity_id) DO UPDATE SET scheduled_start = ?, scheduled_end = ?`,
    [req.session.userId, activityId, new_start, new_end, new_start, new_end]
  );

  res.json({ success: true });
});

// Mark activity as complete
router.post('/:activityId/complete', requireAuth, async (req, res) => {
  const { activityId } = req.params;
  const db = getDb();

  await db.run(
    `INSERT INTO user_activities (user_id, activity_id, completed, completed_at, scheduled_start, scheduled_end)
      VALUES (?, ?, 1, datetime('now'), (SELECT start_time FROM activities WHERE id = ?), (SELECT end_time FROM activities WHERE id = ?))
      ON CONFLICT(user_id, activity_id) DO UPDATE SET completed = 1, completed_at = datetime('now')`,
    [req.session.userId, activityId, activityId, activityId]
  );

  res.json({ success: true });
});

// ADMIN/PM: Get all activities
router.get('/all', requireAuth, async (req, res) => {
  const allowed = await canManageActivities(req.session.userId, req.session.userRole);
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
  const activities = await getDb().all('SELECT * FROM activities ORDER BY start_time ASC');
  res.json(activities);
});

// ADMIN/PM: Create activity
router.post('/', requireAuth, async (req, res) => {
  const allowed = await canManageActivities(req.session.userId, req.session.userRole);
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });

  const { title, description, type, is_mandatory, url, start_time, end_time, presenter_character, dialogue_text, target_specialization } = req.body;

  // Seul l'admin peut créer des activités obligatoires
  const mandatory = req.session.userRole === 'admin' ? (is_mandatory ? 1 : 0) : 0;

  const db = getDb();
  const result = await db.run(
    `INSERT INTO activities (title, description, type, is_mandatory, url, start_time, end_time, presenter_character, dialogue_text, target_specialization, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description, type, mandatory, url, start_time, end_time,
      presenter_character || 'senku', dialogue_text, target_specialization || null, req.session.userId]
  );

  const users = await db.all('SELECT id, specialization FROM users WHERE onboarding_complete = 1');
  for (const u of users) {
    if (!target_specialization || u.specialization === target_specialization) {
      await db.run(
        `INSERT OR IGNORE INTO user_activities (user_id, activity_id, scheduled_start, scheduled_end) VALUES (?, ?, ?, ?)`,
        [u.id, result.lastID, start_time, end_time]
      );
    }
  }

  res.json({ success: true, id: result.lastID });
});

// ADMIN/PM: Update activity
router.put('/:id', requireAuth, async (req, res) => {
  const allowed = await canManageActivities(req.session.userId, req.session.userRole);
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });

  const { title, description, type, is_mandatory, url, start_time, end_time, presenter_character, dialogue_text, target_specialization } = req.body;
  const mandatory = req.session.userRole === 'admin' ? (is_mandatory ? 1 : 0) : 0;

  await getDb().run(
    `UPDATE activities SET title=?, description=?, type=?, is_mandatory=?, url=?, start_time=?, end_time=?, presenter_character=?, dialogue_text=?, target_specialization=? WHERE id=?`,
    [title, description, type, mandatory, url, start_time, end_time, presenter_character, dialogue_text, target_specialization || null, req.params.id]
  );

  res.json({ success: true });
});

// ADMIN/PM: Delete activity
router.delete('/:id', requireAuth, async (req, res) => {
  const allowed = await canManageActivities(req.session.userId, req.session.userRole);
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });

  const db = getDb();
  await db.run('DELETE FROM user_activities WHERE activity_id = ?', [req.params.id]);
  await db.run('DELETE FROM activities WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
