DRIVEFLOW V5.0.0 — PACKAGE COMPLET
==================================

INSTALLATION / MISE À JOUR GITHUB
1. Décompresse ce ZIP.
2. Remplace les fichiers à la racine du dépôt GitHub DriveFlow par TOUS les fichiers de ce dossier.
3. Commit sur main et attends la fin du déploiement GitHub Pages.
4. Ferme complètement la PWA DriveFlow puis relance-la.

SÉCURITÉ DES DONNÉES
- DriveFlow conserve ses données principales dans le localStorage du navigateur.
- La V5 réutilise les clés de stockage V4 pour assurer une migration transparente sur l'appareil déjà utilisé.
- Les sauvegardes JSON V4 ET V5 peuvent être restaurées dans la V5.
- Avant mise à jour, conserver une sauvegarde JSON reste recommandé.
- Le CSV historique personnel n'est PAS inclus dans ce package GitHub public. Il doit être importé localement depuis Réglages.

NOUVEAUTÉS V5
- Barre du bas simplifiée : Aujourd'hui · Semaine · Stats · Réglages.
- Historique déplacé dans Réglages, dans une page dédiée.
- Suppression du gros bouton flottant + ; le bouton discret + Session reste disponible.
- Nouvelle page Top performances depuis Stats :
  • meilleure commande ;
  • meilleur taux horaire ;
  • meilleure session ;
  • meilleur jour ;
  • meilleure semaine ;
  • meilleur mois ;
  • restaurant le plus visité grisé tant que la donnée Uber restaurant n'est pas disponible.
- Nouvelle source permanente « Historique des sessions » via CSV.

IMPORT HISTORIQUE V5
- Le CSV historique sert UNIQUEMENT de source pour les sessions : horaires, pauses, kilomètres, source/fiabilité et prix carburant historique.
- Les gains et commandes restent calculés depuis Uber / Deliveroo afin d'éviter tout double comptage.
- Priorité des sessions : saisie/correction manuelle > CSV historique > reconstruction automatique.
- Un nouvel import Uber ou Deliveroo ne supprime pas les sessions importées depuis le CSV historique.
- Les corrections manuelles d'une session historique sont protégées lors d'un nouvel import du CSV historique.
- Les anciens créneaux qui traversent minuit ou dépassent 04:00 restent modifiables sans casser leur durée ni leur rattachement.
- Une tolérance de 20 minutes est utilisée uniquement pour rattacher les commandes aux anciens créneaux dont les notes peuvent être légèrement arrondies ; elle ne modifie pas la durée affichée de la session.
- Si une ancienne commande ne correspond à aucun créneau historique, la reconstruction automatique peut compléter les trous jusqu'au 10/08/2026.
- Les sessions historiques peuvent contenir une durée totale de pause agrégée ; le temps actif = amplitude de session - pauses.
- Les distances historiques exactes ou estimées du CSV sont conservées telles quelles.
- Le carburant d'une session historique utilise le prix/consommation présents dans le CSV lorsqu'ils sont disponibles ; les sessions récentes utilisent les réglages actuels.

RÈGLES DE BASE CONSERVÉES
- Journée DriveFlow : 04:00 → 04:00 pour les données non rattachées à un créneau historique explicite.
- Plusieurs sessions par journée.
- Objectif journalier configurable ; 0 € = repos.
- Épargne = min(gains, objectif), bonus = max(0, gains - objectif).
- Import Uber snapshot complet depuis driver_payments-0.csv.
- Import Deliveroo en upsert depuis le format strict CSV.
- Sessions automatiques historiques : Uber + Deliveroo, séparation si écart >= 120 min, fin = dernière commande + 45 min.
- Les statistiques horaires utilisent le TEMPS ACTIF après retrait des pauses.

FICHIERS D'IMPORT
- driveflow-deliveroo-template.csv : modèle Deliveroo.
- driveflow-history-template.csv : modèle historique générique. Ne contient aucune donnée personnelle.
