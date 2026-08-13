HOTFIX 4.0.1
- Corrige un blocage au démarrage lors de la migration depuis DriveFlow V3/V1.
- Force le rafraîchissement du JavaScript pour éviter un ancien cache PWA.

DRIVEFLOW V4 — PACKAGE GITHUB
================================

MISE À JOUR
1. Décompresse le ZIP.
2. Dans le repository GitHub "Livraison" : Add file > Upload files.
3. Envoie tous les fichiers de ce dossier à la RACINE du repository.
4. Commit directly to main > Commit changes.
5. Attends le redéploiement GitHub Pages puis recharge l'app.

IMPORTANT : ne supprime pas index.html. Il est remplacé par celui de V4.
Les anciens fichiers "livraison-*" peuvent rester supprimés.

NOUVEAUTÉS V4
- Plusieurs sessions par journée (Midi / Soir / Autre).
- Journée DriveFlow = 04:00 à 04:00 : une commande à 03:30 appartient à la veille.
- Horaires manuels = source de vérité du temps consacré.
- Pause facultative au sein d'une session.
- Minimum 30 minutes entre deux sessions.
- Validation du kilométrage : arrivée >= départ.
- Kilométrage et carburant calculés session par session.
- Import Uber natif depuis driver_payments-0.csv.
- L'import Uber REMPLACE la base Uber importée précédente (l'export Uber étant cumulatif),
  mais conserve les sessions manuelles et les affectations manuelles par Trip UUID.
- Prix, pourboires, frais/ajustements Uber sont additionnés au revenu de la course.
- Un pourboire ajouté plus tard reste rattaché au Trip UUID et donc à la course d'origine.
- Détection des commandes groupées Uber :
  le nombre de lignes "delivery.fare.upfront_base" d'un Trip UUID = nombre de commandes.
- Import Deliveroo hebdomadaire via CSV strict générable depuis captures par ChatGPT.
- Deliveroo est importé en mode upsert : les semaines précédentes ne sont pas supprimées.
- Éléments hors session placés dans "À classer".
- Objectif journalier par défaut + exceptions calendrier + objectif 0 = repos.
- Navigation libre dans les semaines.
- Historique filtrable Jour / Semaine / Mois / Tout et par plateforme.
- Stats carburant / net après carburant / prix moyen par commande.
- Comparateur Uber ↔ Deliveroo caché derrière un bouton dédié.

FICHIER UBER À IMPORTER
Uniquement :
driver_payments-0.csv

Ne pas importer le ZIP complet ni driver_app_analytics-0.csv.

FORMAT STRICT DELIVEROO V4
date;time;earnings;order_count;merchant;external_id;notes

- date : YYYY-MM-DD
- time : HH:MM
- earnings : montant total de la ligne
- order_count : 1, 2, etc. Une double commande à 12 € = order_count 2.
- merchant : nom affiché
- external_id : identifiant stable et unique recommandé. ChatGPT peut le générer.
- notes : facultatif

Exemple :
2026-07-15;19:52;12.00;2;Pokawa - Poké Hawaïen;deliveroo-20260715-1952-pokawa;Double commande

SOURCES DE VÉRITÉ
- Horaires/pause/kilométrage : saisie manuelle.
- Uber : montant importé prioritaire pour les dates couvertes par l'export.
- Deliveroo : import CSV prioritaire pour les dates disposant de lignes importées.
- Les montants manuels restent utiles comme données provisoires avant l'import.

CARBURANT
Formule :
distance x consommation (L/100 km) / 100 x prix du carburant (€/L)
Valeurs par défaut : 5,5 L/100 km et 2,20 €/L, modifiables dans Réglages.

SAUVEGARDE
Avant une grosse mise à jour ou un changement d'iPhone :
Réglages > Sauvegarder toutes mes données.
