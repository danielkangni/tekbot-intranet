const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getProjects, getProjectById, getProjectTasks, updateUserXP, getUserById, getDb } = require('../db/database');

// Get all projects
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const projects = await getProjects();
  const userId = req.session.userId;

  const result = [];
  for (const p of projects) {
    p.required_roles = JSON.parse(p.required_roles);
    const members = await db.all(
      'SELECT u.id, u.name, u.specialization, u.avatar_initial, pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?',
      [p.id]
    );
    const isMember = members.some(m => m.id === userId);

    const roleCounts = {};
    members.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
    p.required_roles = p.required_roles.map(r => ({ ...r, filled: roleCounts[r.specialization] || 0 }));

    const totalSlots = p.required_roles.reduce((s, r) => s + r.count, 0);
    const filledSlots = p.required_roles.reduce((s, r) => s + r.filled, 0);

    // Get project manager info
    let manager = null;
    if (p.project_manager_id) {
      manager = await db.get('SELECT id, name, avatar_initial FROM users WHERE id = ?', [p.project_manager_id]);
    }

    result.push({ ...p, members, is_member: isMember, total_slots: totalSlots, filled_slots: filledSlots, manager });
  }

  res.json(result);
});

// Get project details
router.get('/:id', requireAuth, async (req, res) => {
  const project = await getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });

  const db = getDb();
  const userId = req.session.userId;
  const tasks = await getProjectTasks(req.params.id);
  const isMember = project.members.some(m => m.id === userId);

  const userProgress = await db.all('SELECT task_id, status FROM user_task_progress WHERE user_id = ?', [userId]);
  const progressMap = {};
  userProgress.forEach(p => { progressMap[p.task_id] = p.status; });

  const tasksWithProgress = [];
  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    const status = progressMap[t.id] || 'pending';
    const prevTask = idx > 0 ? tasks[idx - 1] : null;
    const prevDone = idx === 0 || (prevTask && progressMap[prevTask.id] === 'completed');
    const isUnlocked = idx === 0 || prevDone;

    tasksWithProgress.push({ ...t, status, is_unlocked: isUnlocked });
  }

  const completedCount = Object.values(progressMap).filter(s => s === 'completed').length;
  const totalTasks = tasks.length;

  const roleCounts = {};
  project.members.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
  project.required_roles = project.required_roles.map(r => ({
    ...r, filled: roleCounts[r.specialization] || 0
  }));

  let manager = null;
  if (project.project_manager_id) {
    manager = await db.get('SELECT id, name, avatar_initial FROM users WHERE id = ?', [project.project_manager_id]);
  }

  res.json({
    ...project,
    tasks: tasksWithProgress,
    is_member: isMember,
    progress_percent: totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0,
    completed_tasks: completedCount,
    manager
  });
});

// Join project
router.post('/:id/join', requireAuth, async (req, res) => {
  const db = getDb();
  const user = await getUserById(req.session.userId);
  const project = await getProjectById(req.params.id);

  if (!project) return res.status(404).json({ error: 'Projet introuvable' });
  if (!user.specialization) return res.status(400).json({ error: 'Vous devez choisir une spécialisation d\'abord' });
  if (project.status !== 'open') return res.status(400).json({ error: 'Ce projet ne recrute plus' });
  if (user.level < project.min_level) return res.status(400).json({ error: `Niveau ${project.min_level} requis` });

  const isMember = project.members.some(m => m.id === req.session.userId);
  if (isMember) return res.status(400).json({ error: 'Vous êtes déjà membre de ce projet' });

  const roleCounts = {};
  project.members.forEach(m => { roleCounts[m.role] = (roleCounts[m.role] || 0) + 1; });
  const requiredRole = project.required_roles.find(r => r.specialization === user.specialization);

  if (!requiredRole) return res.status(400).json({ error: 'Votre spécialisation n\'est pas requise pour ce projet' });
  const filled = roleCounts[user.specialization] || 0;
  if (filled >= requiredRole.count) return res.status(400).json({ error: 'Tous les postes pour votre spécialisation sont déjà pris' });

  await db.run(
    'INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
    [req.params.id, req.session.userId, user.specialization]
  );

  const tasks = await getProjectTasks(req.params.id);
  if (tasks.length > 0) {
    await db.run(
      'INSERT OR IGNORE INTO user_task_progress (user_id, task_id, status) VALUES (?, ?, ?)',
      [req.session.userId, tasks[0].id, 'pending']
    );
  }

  res.json({ success: true });
});

// Update task progress
router.post('/:id/tasks/:taskId/progress', requireAuth, async (req, res) => {
  const { status } = req.body;
  const db = getDb();
  const userId = req.session.userId;

  const membership = await db.get('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [req.params.id, userId]);
  if (!membership) return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce projet' });

  const task = await db.get('SELECT * FROM project_tasks WHERE id = ? AND project_id = ?', [req.params.taskId, req.params.id]);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

  const now = new Date().toISOString();
  const existing = await db.get('SELECT * FROM user_task_progress WHERE user_id = ? AND task_id = ?', [userId, req.params.taskId]);

  if (existing) {
    await db.run(
      'UPDATE user_task_progress SET status = ?, completed_at = ? WHERE user_id = ? AND task_id = ?',
      [status, status === 'completed' ? now : null, userId, req.params.taskId]
    );
  } else {
    await db.run(
      'INSERT INTO user_task_progress (user_id, task_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)',
      [userId, req.params.taskId, status, now, status === 'completed' ? now : null]
    );
  }

  let xpGained = 0;
  let levelUp = false;
  if (status === 'completed' && !existing?.completed_at) {
    const result = await updateUserXP(userId, task.xp_reward);
    xpGained = task.xp_reward;
    levelUp = result?.leveledUp || false;

    const tasks = await getProjectTasks(req.params.id);
    const taskIndex = tasks.findIndex(t => t.id == req.params.taskId);
    if (taskIndex >= 0 && taskIndex < tasks.length - 1) {
      const nextTask = tasks[taskIndex + 1];
      await db.run(
        'INSERT OR IGNORE INTO user_task_progress (user_id, task_id, status) VALUES (?, ?, ?)',
        [userId, nextTask.id, 'pending']
      );
    }
  }

  res.json({ success: true, xp_gained: xpGained, level_up: levelUp });
});

// ADMIN: Create project
router.post('/', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const { title, description, required_roles, xp_reward, min_level, project_manager_id } = req.body;

  const db = getDb();
  const result = await db.run(
    'INSERT INTO projects (title, description, required_roles, xp_reward, min_level, project_manager_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description, JSON.stringify(required_roles), xp_reward || 500, min_level || 1, project_manager_id || null, req.session.userId]
  );

  res.json({ success: true, id: result.lastID });
});

// ADMIN: Add task to project
router.post('/:id/tasks', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const { title, description, order_index, required_specialization, presenter_character, dialogue_text, xp_reward, resources } = req.body;

  const db = getDb();
  const result = await db.run(
    `INSERT INTO project_tasks (project_id, title, description, order_index, is_locked, required_specialization, presenter_character, dialogue_text, xp_reward, resources)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [req.params.id, title, description, order_index || 0,
      required_specialization || null, presenter_character || 'senku',
      dialogue_text, xp_reward || 50, resources ? JSON.stringify(resources) : null]
  );

  res.json({ success: true, id: result.lastID });
});

// ADMIN: Update project
router.put('/:id', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const { title, description, status, required_roles, xp_reward, min_level, image_url, project_manager_id } = req.body;

  await getDb().run(
    'UPDATE projects SET title=?, description=?, status=?, required_roles=?, xp_reward=?, min_level=?, image_url=?, project_manager_id=? WHERE id=?',
    [title, description, status, JSON.stringify(required_roles), xp_reward, min_level, image_url || null, project_manager_id || null, req.params.id]
  );

  res.json({ success: true });
});

// ADMIN: Delete project
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const db = getDb();
  const id = req.params.id;

  await db.run('DELETE FROM user_task_progress WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id = ?)', [id]);
  await db.run('DELETE FROM project_tasks WHERE project_id = ?', [id]);
  await db.run('DELETE FROM project_members WHERE project_id = ?', [id]);
  await db.run('DELETE FROM projects WHERE id = ?', [id]);

  res.json({ success: true });
});

module.exports = router;
