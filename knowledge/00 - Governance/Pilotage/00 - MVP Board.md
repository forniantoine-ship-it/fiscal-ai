# 🎯 Fiscal AI - MVP Board

> Source de vérité du projet.
> Toute session commence ici.

---

# 🎯 OBJECTIF MVP

Permettre à un propriétaire LMNP de déposer ses documents et d'obtenir une liasse fiscale générée automatiquement.

---

# 🚨 PRIORITÉ UNIQUE

🔌 Connecter le parcours utilisateur au Runtime fiscal.

---

# 👨‍💻 EN COURS (Cursor)

Aucune tâche en cours.

---

# 🚧 BLOCAGE PRINCIPAL

Le tunnel Validation n'appelle pas :

- produceFiscalResult()
- produceLiasse()

Le moteur existe mais n'est pas utilisé par le parcours utilisateur.

---

# 📊 ÉTAT DU MVP

| Module | Etat |
|---------|------|
| Dashboard | 🟡 |
| Upload | ✅ |
| OCR | ✅ |
| Classification | 🟡 |
| Extraction | 🟡 |
| Validation | 🟡 |
| Questions | 🟡 |
| Runtime | ✅ |
| Calcul LMNP | ✅ |
| Liasse | 🟡 |
| Export | 🔴 |

---

# 🔌 CONNEXIONS

Upload → OCR ✅

OCR → Extraction ✅

Extraction → Validation ⚠️

Validation → Runtime ❌

Runtime → Liasse ⚠️

Liasse → Export ❌

---

# 🎯 PROCHAINE TÂCHE

Brancher ValidationDocumentStep sur produceFiscalResult().

---

# 💡 PARKING

- Dashboard Apple Scroll
- IA Dashboard
- Timeline
- Multi biens
- Export EDI