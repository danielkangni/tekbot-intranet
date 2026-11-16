const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tekbot.db');
let db;

function promisifyDb(database) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        database.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
}

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return promisifyDb(db);
}

async function initDatabase() {
  const database = getDb();

  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      specialization TEXT,
      character_id TEXT,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      onboarding_complete INTEGER DEFAULT 0,
      avatar_initial TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      is_mandatory INTEGER DEFAULT 0,
      url TEXT,
      start_time DATETIME,
      end_time DATETIME,
      presenter_character TEXT DEFAULT 'senku',
      dialogue_text TEXT,
      target_specialization TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      activity_id INTEGER REFERENCES activities(id),
      scheduled_start DATETIME,
      scheduled_end DATETIME,
      completed INTEGER DEFAULT 0,
      completed_at DATETIME,
      UNIQUE(user_id, activity_id)
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      specialization TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      duration_minutes INTEGER DEFAULT 10,
      thumbnail_url TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER REFERENCES videos(id),
      title TEXT NOT NULL,
      pass_score INTEGER DEFAULT 70,
      xp_reward INTEGER DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER REFERENCES quizzes(id),
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_option INTEGER NOT NULL,
      explanation TEXT,
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      quiz_id INTEGER REFERENCES quizzes(id),
      score INTEGER NOT NULL,
      passed INTEGER DEFAULT 0,
      answers TEXT,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_progress (
      user_id INTEGER REFERENCES users(id),
      video_id INTEGER REFERENCES videos(id),
      watched INTEGER DEFAULT 0,
      watched_at DATETIME,
      PRIMARY KEY (user_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      status TEXT DEFAULT 'open',
      required_roles TEXT NOT NULL,
      xp_reward INTEGER DEFAULT 500,
      min_level INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER REFERENCES projects(id),
      user_id INTEGER REFERENCES users(id),
      role TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 1,
      required_specialization TEXT,
      presenter_character TEXT DEFAULT 'senku',
      dialogue_text TEXT,
      xp_reward INTEGER DEFAULT 50,
      resources TEXT
    );

    CREATE TABLE IF NOT EXISTS user_task_progress (
      user_id INTEGER REFERENCES users(id),
      task_id INTEGER REFERENCES project_tasks(id),
      status TEXT DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      PRIMARY KEY (user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      specialization TEXT,
      icon TEXT DEFAULT 'star'
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      user_id INTEGER REFERENCES users(id),
      skill_id INTEGER REFERENCES skills(id),
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS level_config (
      level INTEGER PRIMARY KEY,
      xp_required INTEGER NOT NULL,
      title TEXT
    );
  `);

  // Migration: add project_manager_id if not exists
  try {
    await database.exec('ALTER TABLE projects ADD COLUMN project_manager_id INTEGER REFERENCES users(id)');
  } catch(e) { /* column already exists */ }

  await seedData();
}

async function seedData() {
  const database = getDb();
  const adminExists = await database.get('SELECT id FROM users WHERE role = ?', ['admin']);
  if (adminExists) return;

  // Level config
  const levelData = [
    [1, 0, 'Apprenti Scientifique'],
    [2, 200, 'Chercheur Novice'],
    [3, 500, 'Ingénieur Stagiaire'],
    [4, 1000, 'Technicien Confirmé'],
    [5, 2000, 'Expert du Royaume'],
    [6, 3500, 'Maître Artisan'],
    [7, 5500, 'Génie Scientifique'],
    [8, 8000, 'Pilier du Royaume'],
    [9, 11000, 'Légende Vivante'],
    [10, 15000, 'Dieu de la Science']
  ];
  for (const l of levelData) {
    await database.run('INSERT OR IGNORE INTO level_config (level, xp_required, title) VALUES (?, ?, ?)', l);
  }

  // Admin user
  // Mot de passe admin initial : variable ADMIN_PASSWORD, sinon généré aléatoirement et affiché une seule fois.
  const adminPwd = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(9).toString('base64url');
  if (!process.env.ADMIN_PASSWORD) console.log(`[init] Compte admin créé : admin@tekbot.fr / ${adminPwd} (à changer après connexion)`);
  const hashedPwd = bcrypt.hashSync(adminPwd, 10);
  await database.run(
    `INSERT INTO users (name, email, password, role, specialization, character_id, level, xp, onboarding_complete, avatar_initial)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Administrateur TekBot', 'admin@tekbot.fr', hashedPwd, 'admin', 'it', 'senku', 5, 2500, 1, 'A']
  );

  // Default theme
  const defaultTheme = {
    name: 'Royaume de la Science',
    primary: '#c3f5ff',
    primaryContainer: '#00e5ff',
    primaryFixedDim: '#00daf3',
    secondary: '#f4bb92',
    secondaryContainer: '#653d1e',
    tertiary: '#d2f5e0',
    background: '#111415',
    surface: '#111415',
    surfaceContainerLowest: '#0c0e10',
    surfaceContainerLow: '#1a1c1e',
    surfaceContainer: '#1e2022',
    surfaceContainerHigh: '#282a2c',
    surfaceContainerHighest: '#333537',
    onSurface: '#e0e3e4',
    onSurfaceVariant: '#bfc8ca',
    outline: '#849396',
    outlineVariant: '#3b494c',
    error: '#ffb4ab'
  };
  await database.run('INSERT INTO themes (name, config, is_active) VALUES (?, ?, 1)', ['Royaume de la Science', JSON.stringify(defaultTheme)]);

  // Sample skills
  const skills = [
    ['Fusion FDM', 'Modélisation 3D de base avec Fusion 360', '3d', 'view_in_ar'],
    ['Impression PLA', 'Paramétrage et lancement d\'impressions', '3d', 'print'],
    ['Blender Base', 'Modélisation organique avec Blender', '3d', 'category'],
    ['Arduino', 'Programmation Arduino et circuits', 'electronics', 'memory'],
    ['Soudure', 'Techniques de soudure électronique', 'electronics', 'bolt'],
    ['PCB Design', 'Conception de circuits imprimés', 'electronics', 'developer_board'],
    ['Python', 'Programmation Python avancée', 'it', 'code'],
    ['Linux', 'Administration système Linux', 'it', 'terminal'],
    ['Git', 'Contrôle de version avec Git', 'it', 'share'],
    ['ROS', 'Robot Operating System', 'it', 'smart_toy']
  ];
  for (const s of skills) {
    await database.run('INSERT INTO skills (name, description, specialization, icon) VALUES (?, ?, ?, ?)', s);
  }

  // Sample activities
  const activities = [
    {
      title: 'Réunion de lancement - Google Meet',
      description: 'Réunion d\'introduction avec l\'équipe TekBot et présentation du programme de l\'année.',
      type: 'meeting', is_mandatory: 1,
      url: 'https://meet.google.com',
      start_time: getNextDate(1, 10, 0), end_time: getNextDate(1, 11, 30),
      presenter_character: 'senku',
      dialogue_text: '10 milliards de pour cents ! Cette réunion va définir la trajectoire de toute notre année. Ne la ratez sous aucun prétexte !',
      target_specialization: null
    },
    {
      title: 'Installation de Fusion 360',
      description: 'Installer et configurer Fusion 360 pour la modélisation 3D. Suivre le guide d\'installation fourni.',
      type: 'install', is_mandatory: 0,
      url: 'https://www.autodesk.com/products/fusion-360',
      start_time: getNextDate(2, 14, 0), end_time: getNextDate(2, 15, 30),
      presenter_character: 'kaseki',
      dialogue_text: 'Ah, ce Fusion 360... C\'est l\'outil de tout grand artisan numérique ! Installe-le avec soin, jeune apprenti.',
      target_specialization: '3d'
    },
    {
      title: 'Installation de l\'IDE Arduino',
      description: 'Installer l\'IDE Arduino et tester la connexion avec une carte Arduino Uno.',
      type: 'install', is_mandatory: 0,
      url: 'https://www.arduino.cc/en/software',
      start_time: getNextDate(2, 14, 0), end_time: getNextDate(2, 15, 0),
      presenter_character: 'chrome',
      dialogue_text: 'Cet outil va te permettre de donner vie à tes circuits ! Installe-le et on commencera à faire des choses incroyables.',
      target_specialization: 'electronics'
    },
    {
      title: 'Installation de VSCode + Python',
      description: 'Installer Visual Studio Code, Python 3.11 et les extensions recommandées.',
      type: 'install', is_mandatory: 0,
      url: 'https://code.visualstudio.com',
      start_time: getNextDate(2, 14, 0), end_time: getNextDate(2, 15, 0),
      presenter_character: 'senku',
      dialogue_text: 'VSCode est l\'arme ultime du développeur moderne. Suis exactement les instructions et n\'oublie aucune extension.',
      target_specialization: 'it'
    },
    {
      title: 'Session Pro - Robotique Industrielle',
      description: 'Conférence avec M. Laurent, ingénieur chez Thales, sur la robotique dans l\'industrie.',
      type: 'meeting', is_mandatory: 1,
      url: 'https://meet.google.com',
      start_time: getNextDate(7, 16, 0), end_time: getNextDate(7, 17, 30),
      presenter_character: 'kohaku',
      dialogue_text: 'Un guerrier apprend auprès des plus grands. Cet expert va nous partager des connaissances rares. Sois présent !',
      target_specialization: null
    }
  ];

  for (const a of activities) {
    const result = await database.run(
      `INSERT INTO activities (title, description, type, is_mandatory, url, start_time, end_time, presenter_character, dialogue_text, target_specialization, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [a.title, a.description, a.type, a.is_mandatory, a.url, a.start_time, a.end_time, a.presenter_character, a.dialogue_text, a.target_specialization]
    );
  }

  // Sample videos
  const videos = [
    { title: 'Introduction à la modélisation 3D', description: 'Découverte de l\'interface Fusion 360 et premiers concepts.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: '3d', order_index: 1, duration_minutes: 20 },
    { title: 'Créer son premier objet 3D', description: 'Tutoriel pas à pas pour modéliser une pièce simple.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: '3d', order_index: 2, duration_minutes: 35 },
    { title: 'Bases de l\'électronique', description: 'Composants de base, loi d\'Ohm, circuits simples.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: 'electronics', order_index: 1, duration_minutes: 25 },
    { title: 'Premier circuit Arduino', description: 'LED, résistances, et ton premier programme Arduino.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: 'electronics', order_index: 2, duration_minutes: 40 },
    { title: 'Python pour la robotique', description: 'Bases du Python appliquées au contrôle de robots.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: 'it', order_index: 1, duration_minutes: 30 },
    { title: 'Introduction à ROS', description: 'Robot Operating System - concepts fondamentaux.', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', specialization: 'it', order_index: 2, duration_minutes: 45 }
  ];

  for (const v of videos) {
    const videoResult = await database.run(
      'INSERT INTO videos (title, description, url, specialization, order_index, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [v.title, v.description, v.url, v.specialization, v.order_index, v.duration_minutes]
    );

    const quizResult = await database.run(
      'INSERT INTO quizzes (video_id, title, pass_score, xp_reward) VALUES (?, ?, 70, 100)',
      [videoResult.lastID, `Quiz - ${v.title}`]
    );

    const questions = [
      {
        question: `Quel est l'objectif principal de cette formation sur "${v.title}" ?`,
        options: JSON.stringify(['Comprendre les bases', 'Devenir expert immédiatement', 'Remplacer un professeur', 'Faire de la compétition']),
        correct_option: 0,
        explanation: 'Cette formation vise à établir des bases solides pour progresser.'
      },
      {
        question: 'Combien de temps faut-il pour maîtriser ces concepts ?',
        options: JSON.stringify(['1 jour', 'Quelques semaines de pratique', '1 heure', 'Jamais possible']),
        correct_option: 1,
        explanation: 'La maîtrise vient avec une pratique régulière sur plusieurs semaines.'
      },
      {
        question: 'Quelle attitude est essentielle pour progresser ?',
        options: JSON.stringify(['Impatience', 'Curiosité et persévérance', 'Compétition avec les autres', 'Mémorisation pure']),
        correct_option: 1,
        explanation: 'La curiosité et la persévérance sont les clés du succès en robotique.'
      }
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await database.run(
        'INSERT INTO quiz_questions (quiz_id, question, options, correct_option, explanation, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        [quizResult.lastID, q.question, q.options, q.correct_option, q.explanation, i]
      );
    }
  }

  // Sample project
  const projectResult = await database.run(
    `INSERT INTO projects (title, description, status, required_roles, xp_reward, min_level, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      'Robot Explorateur',
      'Concevoir et construire un robot autonome capable de naviguer dans un environnement inconnu et d\'éviter les obstacles. Première mission : cartographier la salle de réunion !',
      'open',
      JSON.stringify([
        { specialization: '3d', label: 'Modéliste 3D', count: 2, filled: 0 },
        { specialization: 'electronics', label: 'Électronicien', count: 1, filled: 0 },
        { specialization: 'it', label: 'Développeur IT', count: 1, filled: 0 }
      ]),
      1000, 2
    ]
  );

  const tasks = [
    { title: 'Étude des besoins', description: 'Analyser les spécifications du robot : taille, capacités, contraintes. Rédiger un document de synthèse.', order_index: 0, is_locked: 0, presenter_character: 'senku', dialogue_text: '10 milliards de pour cents ! Avant de construire quoi que ce soit, on analyse. C\'est la méthode scientifique !', xp_reward: 50, resources: JSON.stringify([{ title: 'Template de spécifications', url: '#', type: 'doc' }]) },
    { title: 'Conception mécanique', description: 'Modéliser le châssis du robot sous Fusion 360. Le robot doit pouvoir accueillir tous les composants électroniques.', order_index: 1, is_locked: 1, required_specialization: '3d', presenter_character: 'kaseki', dialogue_text: 'Ah ! Voilà la vraie création commence. Chaque millimètre compte dans ce châssis, jeune apprenti !', xp_reward: 100, resources: JSON.stringify([{ title: 'Guide Fusion 360 avancé', url: '#', type: 'doc' }]) },
    { title: 'Schéma électronique', description: 'Dessiner le schéma complet du circuit : Arduino, moteurs, capteurs ultrason, alimentation.', order_index: 2, is_locked: 1, required_specialization: 'electronics', presenter_character: 'chrome', dialogue_text: 'Les circuits sont comme des veines... chaque connexion est vitale ! Trace-les avec précision.', xp_reward: 100, resources: JSON.stringify([{ title: 'Datasheet Arduino Uno', url: '#', type: 'doc' }, { title: 'Tutoriel capteur HC-SR04', url: '#', type: 'video' }]) },
    { title: 'Algorithme de navigation', description: 'Développer l\'algorithme d\'évitement d\'obstacles en Python. Tester en simulation avant implémentation.', order_index: 3, is_locked: 1, required_specialization: 'it', presenter_character: 'senku', dialogue_text: 'Un robot sans algorithme intelligent n\'est qu\'un tas de métal. Code avec rigueur !', xp_reward: 100, resources: JSON.stringify([{ title: 'Simulation Python robotique', url: '#', type: 'doc' }]) },
    { title: 'Impression et assemblage', description: 'Imprimer toutes les pièces 3D et assembler le châssis. Vérifier la solidité de chaque joint.', order_index: 4, is_locked: 1, presenter_character: 'kaseki', dialogue_text: 'L\'assemblage révèle la qualité du travail. Prends ton temps, chaque pièce mérite respect.', xp_reward: 75, resources: null },
    { title: 'Câblage et tests', description: 'Câbler tous les composants selon le schéma. Tester chaque sous-système individuellement avant l\'intégration finale.', order_index: 5, is_locked: 1, required_specialization: 'electronics', presenter_character: 'chrome', dialogue_text: 'On ne connecte pas n\'importe comment ! Méthode, patience, et double-vérification !', xp_reward: 75, resources: null },
    { title: 'Intégration finale', description: 'Intégrer l\'algorithme sur l\'Arduino, assembler le robot complet et effectuer les premiers tests de navigation.', order_index: 6, is_locked: 1, presenter_character: 'senku', dialogue_text: '10 milliards de pour cents ! Le moment est venu. Tout converge vers ce test final !', xp_reward: 200, resources: null }
  ];

  for (const t of tasks) {
    await database.run(
      `INSERT INTO project_tasks (project_id, title, description, order_index, is_locked, required_specialization, presenter_character, dialogue_text, xp_reward, resources)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectResult.lastID, t.title, t.description, t.order_index, t.is_locked, t.required_specialization || null, t.presenter_character, t.dialogue_text, t.xp_reward, t.resources]
    );
  }
}

function getNextDate(daysFromNow, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Helper query functions
async function getUserById(id) {
  return getDb().get('SELECT * FROM users WHERE id = ?', [id]);
}

async function getUserByEmail(email) {
  return getDb().get('SELECT * FROM users WHERE email = ?', [email]);
}

async function updateUserXP(userId, xpGain) {
  const database = getDb();
  const user = await getUserById(userId);
  if (!user) return;

  const newXP = user.xp + xpGain;
  const newLevel = await calculateLevel(newXP);
  await database.run('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXP, newLevel, userId]);
  return { xp: newXP, level: newLevel, leveledUp: newLevel > user.level };
}

async function calculateLevel(xp) {
  const database = getDb();
  const levels = await database.all('SELECT level, xp_required FROM level_config ORDER BY level DESC');
  for (const l of levels) {
    if (xp >= l.xp_required) return l.level;
  }
  return 1;
}

async function getActiveTheme() {
  const row = await getDb().get('SELECT config FROM themes WHERE is_active = 1');
  if (!row) return null;
  return JSON.parse(row.config);
}

async function getUserActivities(userId) {
  const database = getDb();
  const user = await getUserById(userId);
  if (!user) return [];

  return database.all(
    `SELECT a.*, ua.scheduled_start, ua.scheduled_end, ua.completed, ua.completed_at, ua.id as ua_id
     FROM activities a
     LEFT JOIN user_activities ua ON ua.activity_id = a.id AND ua.user_id = ?
     WHERE (a.target_specialization IS NULL OR a.target_specialization = ?)
     ORDER BY COALESCE(ua.scheduled_start, a.start_time) ASC`,
    [userId, user.specialization]
  );
}

async function getVideosBySpecialization(spec) {
  return getDb().all('SELECT * FROM videos WHERE specialization = ? ORDER BY order_index ASC', [spec]);
}

async function getUserVideoProgress(userId) {
  return getDb().all('SELECT video_id, watched FROM video_progress WHERE user_id = ?', [userId]);
}

async function getQuizByVideoId(videoId) {
  const database = getDb();
  const quiz = await database.get('SELECT * FROM quizzes WHERE video_id = ?', [videoId]);
  if (!quiz) return null;
  const questions = await database.all('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC', [quiz.id]);
  return { ...quiz, questions };
}

async function getBestQuizAttempt(userId, quizId) {
  return getDb().get('SELECT * FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? ORDER BY score DESC LIMIT 1', [userId, quizId]);
}

async function getProjects() {
  return getDb().all('SELECT * FROM projects ORDER BY created_at DESC');
}

async function getProjectById(id) {
  const database = getDb();
  const project = await database.get('SELECT * FROM projects WHERE id = ?', [id]);
  if (!project) return null;
  project.required_roles = JSON.parse(project.required_roles);
  const members = await database.all(
    `SELECT u.id, u.name, u.specialization, u.character_id, u.level, u.avatar_initial, pm.role
     FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?`,
    [id]
  );
  project.members = members;
  return project;
}

async function getProjectTasks(projectId) {
  const database = getDb();
  const tasks = await database.all('SELECT * FROM project_tasks WHERE project_id = ? ORDER BY order_index ASC', [projectId]);
  return tasks.map(t => ({ ...t, resources: t.resources ? JSON.parse(t.resources) : [] }));
}

module.exports = {
  getDb, initDatabase, getUserById, getUserByEmail, updateUserXP,
  calculateLevel, getActiveTheme, getUserActivities, getVideosBySpecialization,
  getUserVideoProgress, getQuizByVideoId, getBestQuizAttempt, getProjects,
  getProjectById, getProjectTasks
};
