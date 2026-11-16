# Intranet TekBot EPITECH

Intranet du club de robotique TekBot d'EPITECH Bénin. Les membres y suivent des formations vidéo avec quiz notés, rejoignent des projets robotiques, consultent le planning et valident leur présence. L'interface reprend un univers « Royaume de la Science » avec niveaux et points d'expérience.

## Fonctionnalités

- **Formation** : vidéos par spécialité (modélisation 3D, électronique, informatique) et quiz notés qui débloquent de l'expérience.
- **Projets** : équipes par rôle requis, tâches débloquées pas à pas, niveau minimum.
- **Planning** : réunions et installations, obligatoires ou flexibles, avec validation de présence.
- **Administration** : membres, rôles (membre, admin, super-admin), validation des inscriptions, vidéos, projets, thème.
- **Sécurité** : mots de passe hachés avec bcrypt, sessions, réinitialisation de mot de passe.

## Stack

Node.js, Express, SQLite, bcrypt, sessions Express, HTML/CSS/JS sans framework.

## Lancer en local

```bash
npm install
ADMIN_PASSWORD="un-mot-de-passe" SESSION_SECRET="une-longue-chaine-aleatoire" npm start
# http://localhost:3000, compte admin : admin@tekbot.fr
```

La base `db/tekbot.db` est créée au premier lancement avec des données de démonstration. Sans `ADMIN_PASSWORD`, un mot de passe aléatoire est généré et affiché une seule fois dans la console.

## À propos de ce dépôt

Copie publique de l'intranet, préparée pour le portfolio : la base de données et les valeurs par défaut sensibles (mot de passe admin, secret de session) ont été retirées.

---

Auteur : KANGNI Jean-Daniel · [Portfolio](https://danielkangni.github.io) · [GitHub](https://github.com/danielkangni)
