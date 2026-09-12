# Plan / Task Memory / Persistent Knowledge

Protocole léger pour travailler sur une mission longue sans garder tout l'historique en contexte. Pas d'outillage requis — trois niveaux de mémoire à tenir mentalement ou dans un artefact minimal quand la mission le justifie.

## A. Plan — mémoire durable de la mission

Contient uniquement :

- objectif ;
- étapes ;
- statut des étapes ;
- décisions structurantes ;
- blocages ;
- prochain travail à effectuer.

Doit permettre à un agent de reprendre la mission après changement de session ou compaction, sans relire tout l'historique.

## B. Task Memory — mémoire temporaire de l'étape en cours

Peut contenir : fichiers actifs, résultats intermédiaires, tests locaux, hypothèses, observations, pistes explorées, erreurs rencontrées.

Reste petite et locale à l'étape.

À la fin de l'étape :

- supprimer / abandonner ce qui n'a plus de valeur ;
- promouvoir uniquement les résultats réellement utiles au Plan ou à la Persistent Knowledge.

## C. Persistent Knowledge — ce qui survit à la mission

Ne contient que les informations validées ayant une valeur pour de futures missions. Destination selon la nature (voir [change-protocol.md § Knowledge & Skill Check](change-protocol.md)) :

- Knowledge System (`knowledge/`) ;
- Skill (`.agents/skills/`, voir [skill-governance.md](skill-governance.md)) ;
- `.agents/core`.

**Le contexte de travail ne doit jamais devenir la mémoire permanente du projet.**

Ne pas créer de dossier de travail permanent ou de fichiers de mission vides par anticipation — un artefact Plan/Task Memory n'est créé que lorsqu'une mission concrète en a réellement besoin (mission longue, reprise après compaction).
