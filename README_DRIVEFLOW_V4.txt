DRIVEFLOW V4.0.6 — PACKAGE COMPLET STABLE
=========================================

INSTALLATION / MISE À JOUR GITHUB
1. Décompresse ce ZIP.
2. Dans le repository GitHub "Livraison", remplace les fichiers à la RACINE par TOUS les fichiers de ce dossier.
3. Commit directement sur main.
4. Attends le déploiement GitHub Pages.
5. Ferme complètement DriveFlow sur l'iPhone, puis relance l'application.

IMPORTANT
- Ce package est complet : index, JavaScript, CSS, service worker, manifest, icônes, image de marque, modèle CSV et README.
- Les données DriveFlow sont stockées dans le localStorage du navigateur et ne sont pas supprimées par le remplacement des fichiers GitHub.
- Avant toute grosse évolution, une sauvegarde JSON depuis Réglages reste recommandée.

CORRECTIONS V4.0.6
- Base visuelle/navigation reprise de la V4.0.3 stable.
- Correction de la régression V4.0.4 : les sélecteurs de date Stats / Historique / Comparatif sont de nouveau présents dans le HTML, ce qui évite l'arrêt du JavaScript avant l'initialisation de la barre d'onglets.
- Toutes les barres temporelles restent sélectionnables par calendrier : Aujourd'hui, Semaine, Stats, Historique et Comparatif.
- "Éléments à classer" est recalculé sur la journée actuellement sélectionnée et disparaît totalement lorsqu'il n'y a rien à classer.
- Cache PWA renouvelé en V4.0.6.

SESSIONS HISTORIQUES — JUSQU'AU 10/08/2026 INCLUS
- Les commandes Uber + Deliveroo sont fusionnées chronologiquement, car une session DriveFlow est commune aux deux plateformes.
- Un écart d'au moins 120 minutes entre deux débuts de commande crée une nouvelle session.
- Début estimé = heure de début de la première commande du groupe.
- Fin estimée = heure de début de la dernière commande + 45 minutes.
- Journée DriveFlow = 04:00 → 04:00 : une commande avant 04:00 appartient à la veille.
- Une session manuelle sur une date reste prioritaire : DriveFlow ne génère alors pas de session historique automatique pour cette date.
- Si une session manuelle historique est supprimée, les sessions automatiques correspondantes sont immédiatement reconstruites.
- Les sessions historiques sont recalculées au démarrage, après import Uber, après import Deliveroo et après restauration d'une sauvegarde.

RÈGLES GÉNÉRALES V4
- Plusieurs sessions par journée (Midi / Soir / Autre).
- Horaires manuels = source de vérité pour les périodes récentes / renseignées manuellement.
- Pause facultative au sein d'une session.
- Minimum 30 minutes entre deux sessions manuelles.
- Validation du kilométrage : arrivée >= départ.
- Distance totale = somme des distances de chaque session.
- Carburant estimé = distance × consommation / 100 × prix du carburant.
- Valeurs par défaut : 5,5 L/100 km et 2,20 €/L, modifiables dans Réglages.

UBER
- Importer uniquement driver_payments-0.csv.
- L'import Uber est un snapshot cumulatif : il remplace la base Uber importée précédente, sans additionner un ancien import.
- Les montants officiels Uber remplacent les montants Uber manuels provisoires pour les dates couvertes.
- Pourboires / bonus / ajustements d'un Trip UUID sont additionnés au groupe correspondant.
- Le nombre de lignes delivery.fare.upfront_base d'un Trip UUID détermine le nombre de commandes (double, triple, etc.).

DELIVEROO
Format CSV strict :
date;time;earnings;order_count;merchant;external_id;notes

Exemple :
2026-07-15;19:52;12.00;2;Pokawa - Poké Hawaïen;deliveroo-20260715-1952-pokawa;Double commande

- L'import Deliveroo est en mode upsert et n'efface pas les imports précédents.
- order_count doit refléter le nombre réel de commandes lorsqu'une ligne Deliveroo correspond à une double commande.

OBJECTIFS / STATS
- Objectif journalier par défaut configurable.
- Exception par date ; 0 € = jour de repos.
- Épargne = min(gains, objectif).
- Bonus = max(0, gains - objectif).
- Stats : gains, épargne, bonus, temps, distance, carburant estimé, net après carburant, gain/heure, moyenne/commande.
- Comparatif Uber ↔ Deliveroo descriptif uniquement, basé sur les commandes réalisées.
