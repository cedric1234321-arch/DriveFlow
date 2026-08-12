DRIVEFLOW V3 — MISE À JOUR GITHUB

1) Supprime les anciens fichiers de l'application si nécessaire.
2) Mets tous les fichiers de ce dossier à la RACINE du repository GitHub.
3) Commit directement sur main.
4) GitHub Pages redéploiera automatiquement DriveFlow.

IMPORT CSV
Colonnes reconnues :
date;platform;earnings;start_time;end_time;duration_minutes;distance_km;origin;destination;notes

Exemple :
2026-08-12;Uber Eats;8.45;11:42;12:06;24;5.8;Montpellier Centre;Port Marianne;

Tu peux fournir à une IA tes captures Uber Driver et lui demander de produire exactement ce format CSV. Ensuite : DriveFlow > Réglages > Import CSV.

IMPORTANT :
- Les courses importées sont dédoublonnées.
- Les gains Uber/Deliveroo d'une date importée sont recalculés à partir des courses importées.
- Les infos manuelles comme kilométrage compteur et notes sont conservées.
- L'app migre automatiquement les anciennes données stockées sous livraisons.entries.v1.
