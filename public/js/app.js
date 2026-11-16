// ─── Theme Loader ───────────────────────────────────────────────────────────
async function loadTheme() {
  try {
    const theme = await fetch('/api/theme').then(r => r.json());
    applyTheme(theme);
  } catch(e) {}
}

function applyTheme(t) {
  const root = document.documentElement;
  const map = {
    '--color-primary': t.primary,
    '--color-primary-container': t.primaryContainer,
    '--color-primary-fixed-dim': t.primaryFixedDim,
    '--color-secondary': t.secondary,
    '--color-secondary-container': t.secondaryContainer,
    '--color-tertiary': t.tertiary,
    '--color-background': t.background,
    '--color-surface': t.surface,
    '--color-surface-lowest': t.surfaceContainerLowest,
    '--color-surface-low': t.surfaceContainerLow,
    '--color-surface-container': t.surfaceContainer,
    '--color-surface-high': t.surfaceContainerHigh,
    '--color-surface-highest': t.surfaceContainerHighest,
    '--color-on-surface': t.onSurface,
    '--color-on-surface-variant': t.onSurfaceVariant,
    '--color-outline': t.outline,
    '--color-outline-variant': t.outlineVariant,
    '--color-error': t.error
  };
  for (const [k, v] of Object.entries(map)) {
    if (v) root.style.setProperty(k, v);
  }

  // Override Tailwind utility classes with dynamic theme colors
  let styleEl = document.getElementById('theme-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'theme-overrides';
    document.head.appendChild(styleEl);
  }
  const p = t.primary || '#c3f5ff';
  const pc = t.primaryContainer || '#00e5ff';
  const s = t.secondary || '#f4bb92';
  const sc = t.secondaryContainer || '#653d1e';
  const ter = t.tertiary || '#d2f5e0';
  const bg = t.background || '#111415';
  const surf = t.surfaceContainer || '#1e2022';
  const surfLow = t.surfaceContainerLow || '#1a1c1e';
  const surfLowest = t.surfaceContainerLowest || '#0c0e10';
  const surfHigh = t.surfaceContainerHigh || '#282a2c';
  const surfHighest = t.surfaceContainerHighest || '#333537';
  const onSurf = t.onSurface || '#e0e3e4';
  const onSurfVar = t.onSurfaceVariant || '#bfc8ca';
  const outline = t.outline || '#849396';
  const outlineVar = t.outlineVariant || '#3b494c';
  const err = t.error || '#ffb4ab';

  styleEl.textContent = `
    .bg-primary { background-color: ${p} !important; }
    .text-primary { color: ${p} !important; }
    .border-primary { border-color: ${p} !important; }
    .bg-primary-container { background-color: ${pc} !important; }
    .text-primary-container { color: ${pc} !important; }
    .border-primary-container { border-color: ${pc} !important; }
    .bg-secondary { background-color: ${s} !important; }
    .text-secondary { color: ${s} !important; }
    .border-secondary { border-color: ${s} !important; }
    .bg-secondary-container { background-color: ${sc} !important; }
    .text-tertiary { color: ${ter} !important; }
    .bg-tertiary { background-color: ${ter} !important; }
    .border-tertiary { border-color: ${ter} !important; }
    .bg-background { background-color: ${bg} !important; }
    .text-background { color: ${bg} !important; }
    .bg-surface-container { background-color: ${surf} !important; }
    .bg-surface-container-low { background-color: ${surfLow} !important; }
    .bg-surface-container-lowest { background-color: ${surfLowest} !important; }
    .bg-surface-container-high { background-color: ${surfHigh} !important; }
    .bg-surface-container-highest { background-color: ${surfHighest} !important; }
    .text-on-surface { color: ${onSurf} !important; }
    .text-on-surface-variant { color: ${onSurfVar} !important; }
    .border-outline { border-color: ${outline} !important; }
    .border-outline-variant { border-color: ${outlineVar} !important; }
    .text-error { color: ${err} !important; }
    .bg-error { background-color: ${err} !important; }
    .border-error { border-color: ${err} !important; }
  `;
}

// ─── Auth Guard ──────────────────────────────────────────────────────────────
async function requireUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login.html'; return null; }
    return await res.json();
  } catch(e) { window.location.href = '/login.html'; return null; }
}

async function requireAdmin() {
  const user = await requireUser();
  if (!user) return null;
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return null; }
  return user;
}

// ─── API Helpers ─────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  };
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

const API = {
  get: (url) => api('GET', url),
  post: (url, body) => api('POST', url, body),
  put: (url, body) => api('PUT', url, body),
  patch: (url, body) => api('PATCH', url, body),
  delete: (url) => api('DELETE', url)
};

// ─── Characters ──────────────────────────────────────────────────────────────
const CHARACTERS = {
  senku:  { name: 'Senku Ishigami', emoji: '🧪', color: '#c3f5ff', tagline: 'Génie scientifique',       photo: '/images/senku.jpeg' },
  kaseki: { name: 'Kaseki',         emoji: '🗿', color: '#f4bb92', tagline: 'Maître Artisan',            photo: '/images/kaseki.webp' },
  chrome: { name: 'Chrome',         emoji: '⚡', color: '#d2f5e0', tagline: 'Électronicien de génie',    photo: '/images/chrome.webp' },
  gen:    { name: 'Gen Asagiri',    emoji: '🃏', color: '#f4bb92', tagline: 'Stratège du Royaume',       photo: null },
  kohaku: { name: 'Kohaku',         emoji: '⚔️', color: '#ffb4ab', tagline: 'Guerrière du Royaume',      photo: null }
};

const SPEC_LABELS = { '3d': 'Modélisation 3D', 'electronics': 'Électronique', 'it': 'Informatique' };
const SPEC_COLORS = { '3d': '#f4bb92', 'electronics': '#d2f5e0', 'it': '#c3f5ff' };
const SPEC_ICONS = { '3d': 'view_in_ar', 'electronics': 'bolt', 'it': 'code' };

// ─── UI Helpers ──────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-tertiary-container text-on-surface border-tertiary',
    error: 'bg-error text-background border-error',
    info: 'bg-primary-container text-background border-primary',
    xp: 'bg-primary-container text-background border-primary'
  };
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg border text-sm font-medium flex items-center gap-2 shadow-2xl transition-all duration-300 ${colors[type] || colors.info}`;
  const icons = { success: 'check_circle', error: 'error', info: 'info', xp: 'stars' };
  toast.innerHTML = `<span class="material-symbols-rounded text-base">${icons[type] || 'info'}</span>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(10px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showLevelUp(newLevel, title) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="text-center animate-bounce-in">
      <div class="text-8xl mb-4">⚡</div>
      <div class="text-primary font-serif text-4xl font-bold mb-2">NIVEAU ${newLevel} !</div>
      <div class="text-on-surface-variant text-xl">${title}</div>
      <div class="mt-6 text-sm text-on-surface-variant">[ Cliquez pour continuer ]</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  setTimeout(() => overlay.remove(), 5000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ─── Sidebar + Nav ───────────────────────────────────────────────────────────
function initNav(activePage, user) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const navItems = [
    { href: '/dashboard.html', icon: 'home', label: 'Laboratoire' },
    { href: '/schedule.html', icon: 'calendar_month', label: 'Planning' },
    { href: '/training.html', icon: 'school', label: 'Formation' },
    { href: '/projects.html', icon: 'rocket_launch', label: 'Projets' }
  ];

  const char = CHARACTERS[user?.character_id] || CHARACTERS.senku;
  const specLabel = SPEC_LABELS[user?.specialization] || 'Non défini';

  sidebar.innerHTML = `
    <div class="flex flex-col h-full">
      <div class="p-6 border-b border-outline-variant/20">
        <a href="/dashboard.html" class="flex items-center gap-3 mb-8">
          <div class="w-8 h-8 rounded bg-primary-container flex items-center justify-center">
            <span class="material-symbols-rounded text-background text-lg">science</span>
          </div>
          <div>
            <div class="font-serif font-bold text-on-surface text-sm leading-none">ROYAUME</div>
            <div class="text-primary text-xs font-label tracking-widest">DE LA SCIENCE</div>
          </div>
        </a>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-sm border border-primary/30">
            ${user?.avatar_initial || user?.name?.charAt(0) || '?'}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-on-surface text-sm font-medium truncate">${user?.name || 'Utilisateur'}</div>
            <div class="text-on-surface-variant text-xs font-label">${specLabel}</div>
          </div>
        </div>
        <div class="mt-3">
          <div class="flex justify-between text-xs text-on-surface-variant font-label mb-1">
            <span>LVL ${user?.level || 1}</span>
            <span>${user?.xp || 0} XP</span>
          </div>
          <div class="h-1 bg-surface-container-high rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full transition-all" style="width: ${Math.min(100, ((user?.xp || 0) / (user?.xp_for_next || 500)) * 100)}%"></div>
          </div>
        </div>
      </div>
      <nav class="flex-1 p-4 space-y-1">
        ${navItems.map(item => {
          const isActive = item.href === activePage;
          return `<a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}">
            <span class="material-symbols-rounded text-xl">${item.icon}</span>
            <span>${item.label}</span>
          </a>`;
        }).join('')}
        ${user?.role === 'admin' ? `
        <div class="pt-4 mt-4 border-t border-outline-variant/20">
          <div class="text-xs text-on-surface-variant font-label uppercase tracking-wider px-3 mb-2">Administration</div>
          <a href="/admin/index.html" class="flex items-center gap-3 px-3 py-2.5 rounded text-sm text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all">
            <span class="material-symbols-rounded text-xl">admin_panel_settings</span>
            <span>Panneau Admin</span>
          </a>
        </div>` : ''}
      </nav>
      <div class="p-4 border-t border-outline-variant/20">
        <button onclick="logout()" class="flex items-center gap-3 px-3 py-2.5 rounded text-sm text-on-surface-variant hover:text-error hover:bg-error/5 transition-all w-full">
          <span class="material-symbols-rounded text-xl">logout</span>
          <span>Déconnexion</span>
        </button>
      </div>
    </div>`;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ─── Dialogue Component ──────────────────────────────────────────────────────
function createDialogue(characterId, text, onClose) {
  const char = CHARACTERS[characterId] || CHARACTERS.senku;
  const box = document.createElement('div');
  box.className = 'fixed inset-0 z-50 flex items-end justify-center p-6 bg-background/70 backdrop-blur-sm';
  const avatarHtml = char.photo
    ? `<img src="${char.photo}" alt="${char.name}" class="w-full h-full object-cover object-top">`
    : `<div class="w-full h-full flex items-center justify-center font-serif font-bold text-lg" style="color:${char.color}">${char.emoji}</div>`;
  box.innerHTML = `
    <div class="w-full max-w-2xl">
      <div class="bg-surface-container border border-outline-variant/30 rounded-lg p-5 relative shadow-2xl" style="border-color:${char.color}20">
        <div class="flex items-start gap-4">
          <div class="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2" style="border-color:${char.color}60">
            ${avatarHtml}
          </div>
          <div class="flex-1">
            <div class="font-label text-xs mb-1" style="color: ${char.color}">${char.name} — ${char.tagline}</div>
            <div class="text-on-surface text-sm leading-relaxed" id="dialogue-text"></div>
          </div>
        </div>
        <button class="absolute bottom-3 right-4 text-xs text-on-surface-variant font-label flex items-center gap-1 hover:text-primary transition-colors" onclick="this.closest('.fixed').remove(); ${onClose ? 'dialogueCallback()' : ''}">
          Continuer <span class="material-symbols-rounded text-sm">arrow_forward</span>
        </button>
      </div>
    </div>`;

  document.body.appendChild(box);
  if (onClose) window.dialogueCallback = onClose;

  // Typewriter effect
  const textEl = box.querySelector('#dialogue-text');
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      textEl.textContent += text[i++];
    } else {
      clearInterval(interval);
    }
  }, 20);

  box.addEventListener('click', (e) => {
    if (e.target === box) {
      clearInterval(interval);
      textEl.textContent = text;
    }
  });
}

// ─── XP Animation ────────────────────────────────────────────────────────────
function animateXPGain(amount, levelUp, newLevel, levelTitle) {
  const popup = document.createElement('div');
  popup.className = 'fixed top-24 right-6 z-50 bg-primary text-background px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg';
  popup.innerHTML = `<span class="material-symbols-rounded">stars</span>+${amount} XP`;
  document.body.appendChild(popup);
  popup.style.animation = 'slideInRight 0.3s ease, fadeOut 0.5s ease 2.5s forwards';

  setTimeout(() => popup.remove(), 3000);

  if (levelUp) {
    setTimeout(() => {
      const db = { prepare: () => ({ get: () => ({ title: levelTitle || 'Nouveau Niveau' }) }) };
      showLevelUp(newLevel, levelTitle || 'Niveau supérieur !');
    }, 500);
  }
}

// Inject global styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes bounce-in { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
  .animate-bounce-in { animation: bounce-in 0.5s ease; }
  .blueprint-grid {
    background-image: radial-gradient(circle, rgba(132,147,150,0.08) 1px, transparent 1px);
    background-size: 24px 24px;
  }
`;
document.head.appendChild(style);
