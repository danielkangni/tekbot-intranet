const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getVideosBySpecialization, getUserVideoProgress, getQuizByVideoId, getBestQuizAttempt, updateUserXP, getUserById, getDb } = require('../db/database');

// Get training modules for current user
router.get('/modules', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId);
  if (!user || !user.specialization) return res.json({ videos: [], progress: [] });

  const videos = await getVideosBySpecialization(user.specialization);
  const progress = await getUserVideoProgress(req.session.userId);
  const progressMap = {};
  progress.forEach(p => { progressMap[p.video_id] = p.watched; });

  const db = getDb();
  const result = [];
  for (let idx = 0; idx < videos.length; idx++) {
    const v = videos[idx];
    const quiz = await db.get('SELECT id, pass_score, xp_reward FROM quizzes WHERE video_id = ?', [v.id]);
    const bestAttempt = quiz ? await getBestQuizAttempt(req.session.userId, quiz.id) : null;
    const watched = !!progressMap[v.id];
    const unlocked = idx === 0 || !!progressMap[videos[idx - 1]?.id];

    result.push({
      ...v,
      watched,
      unlocked,
      quiz_id: quiz?.id || null,
      quiz_passed: bestAttempt?.passed || false,
      best_score: bestAttempt?.score || null
    });
  }

  const totalWatched = result.filter(v => v.watched).length;
  const totalPassed = result.filter(v => v.quiz_passed).length;

  res.json({
    videos: result,
    total: videos.length,
    watched_count: totalWatched,
    passed_count: totalPassed,
    completion_percent: videos.length ? Math.round((totalPassed / videos.length) * 100) : 0
  });
});

// Mark video as watched
router.post('/videos/:id/watch', requireAuth, async (req, res) => {
  const db = getDb();
  await db.run(
    `INSERT INTO video_progress (user_id, video_id, watched, watched_at) VALUES (?, ?, 1, datetime('now'))
      ON CONFLICT(user_id, video_id) DO UPDATE SET watched = 1, watched_at = datetime('now')`,
    [req.session.userId, req.params.id]
  );
  res.json({ success: true });
});

// Get quiz
router.get('/quizzes/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const quiz = await db.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return res.status(404).json({ error: 'Quiz introuvable' });

  const progress = await db.get('SELECT watched FROM video_progress WHERE user_id = ? AND video_id = ?', [req.session.userId, quiz.video_id]);
  if (!progress?.watched) return res.status(403).json({ error: 'Vous devez d\'abord regarder la vidéo' });

  const questions = await db.all('SELECT id, question, options, order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC', [quiz.id]);
  const bestAttempt = await getBestQuizAttempt(req.session.userId, quiz.id);

  res.json({
    ...quiz,
    questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })),
    best_attempt: bestAttempt,
    already_passed: bestAttempt?.passed || false
  });
});

// Submit quiz
router.post('/quizzes/:id/submit', requireAuth, async (req, res) => {
  const { answers } = req.body;
  const db = getDb();

  const quiz = await db.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return res.status(404).json({ error: 'Quiz introuvable' });

  const questions = await db.all('SELECT * FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
  let correct = 0;
  const results = questions.map(q => {
    const given = answers[q.id];
    const isCorrect = given === q.correct_option || given == q.correct_option;
    if (isCorrect) correct++;
    return { question_id: q.id, given, correct_option: q.correct_option, is_correct: isCorrect, explanation: q.explanation };
  });

  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= quiz.pass_score;

  await db.run(
    'INSERT INTO quiz_attempts (user_id, quiz_id, score, passed, answers) VALUES (?, ?, ?, ?, ?)',
    [req.session.userId, quiz.id, score, passed ? 1 : 0, JSON.stringify(answers)]
  );

  let xpGained = 0;
  let levelUp = false;
  if (passed) {
    const prev = await db.all('SELECT id FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND passed = 1 ORDER BY attempted_at ASC LIMIT 1', [req.session.userId, quiz.id]);
    if (prev.length <= 1) {
      const result = await updateUserXP(req.session.userId, quiz.xp_reward);
      xpGained = quiz.xp_reward;
      levelUp = result?.leveledUp || false;
    }
  }

  res.json({ score, passed, correct, total: questions.length, results, xp_gained: xpGained, level_up: levelUp });
});

// ADMIN: Add video
router.post('/videos', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const { title, description, url, specialization, order_index, duration_minutes } = req.body;

  const db = getDb();
  const result = await db.run(
    'INSERT INTO videos (title, description, url, specialization, order_index, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description, url, specialization, order_index || 0, duration_minutes || 10, req.session.userId]
  );

  res.json({ success: true, id: result.lastID });
});

// ADMIN: Delete video
router.delete('/videos/:id', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const db = getDb();
  const video = await db.get('SELECT id FROM videos WHERE id = ?', [req.params.id]);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  const quiz = await db.get('SELECT id FROM quizzes WHERE video_id = ?', [req.params.id]);
  if (quiz) {
    await db.run('DELETE FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
    await db.run('DELETE FROM quiz_attempts WHERE quiz_id = ?', [quiz.id]);
    await db.run('DELETE FROM quizzes WHERE id = ?', [quiz.id]);
  }
  await db.run('DELETE FROM video_progress WHERE video_id = ?', [req.params.id]);
  await db.run('DELETE FROM videos WHERE id = ?', [req.params.id]);

  res.json({ success: true });
});

// ADMIN: Create quiz for video
router.post('/videos/:videoId/quiz', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const { title, pass_score, xp_reward, questions } = req.body;

  const db = getDb();
  const existing = await db.get('SELECT id FROM quizzes WHERE video_id = ?', [req.params.videoId]);
  if (existing) {
    await db.run('DELETE FROM quiz_questions WHERE quiz_id = ?', [existing.id]);
    await db.run('DELETE FROM quizzes WHERE id = ?', [existing.id]);
  }

  const quizResult = await db.run(
    'INSERT INTO quizzes (video_id, title, pass_score, xp_reward) VALUES (?, ?, ?, ?)',
    [req.params.videoId, title, pass_score || 70, xp_reward || 100]
  );

  for (let i = 0; i < (questions || []).length; i++) {
    const q = questions[i];
    await db.run(
      'INSERT INTO quiz_questions (quiz_id, question, options, correct_option, explanation, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [quizResult.lastID, q.question, JSON.stringify(q.options), q.correct_option, q.explanation || null, i]
    );
  }

  res.json({ success: true, quiz_id: quizResult.lastID });
});

// ADMIN: Get all videos
router.get('/videos/all', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  const videos = await getDb().all('SELECT v.*, (SELECT COUNT(*) FROM quizzes WHERE video_id = v.id) as has_quiz FROM videos v ORDER BY specialization, order_index');
  res.json(videos);
});

module.exports = router;
