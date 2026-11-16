function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé - Réservé aux administrateurs' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
