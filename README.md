# Omertà

Jeu de gestion de mafia au tour par tour dans le navigateur. New Corrano, 1925, en pleine Prohibition : tu reprends une petite famille, tu fais tourner la contrebande, tu montes des coups, tu tiens tes commerçants et tu manœuvres entre les familles pour devenir le Capo dei Capi.

## Jouer en local

```bash
npm install
npm run dev
```

## Build et déploiement

```bash
npm run build   # vérifie les types puis génère dist/
```

Sur Vercel, importer le repo : le preset Vite est détecté automatiquement (build `npm run build`, sortie `dist`). Aucune variable d'environnement.

## Tests

```bash
npm test 400                         # 400 parties jouées par un bot (bot complet)
npx vite-node tests/sim.ts 300 --dumb # bot naïf : ni coups, ni contrebande, ni diplomatie
npx vite-node tests/forecast.ts      # prévisions = ce que le moteur applique (0 écart attendu)
npx vite-node tests/calib.ts         # % affiché = taux de réussite réel (assauts et coups)
```

Le bot ne gère ni la heat ni les commerçants : il sert à repérer les dérives, pas à mesurer la difficulté pour un humain. Repère v0.2 : environ 25 % de victoires pour le bot.

## Règles

- **Le temps passe.** Une horloge fait défiler les jours (×1, ×2, ×3, pause, barre d'espace). Les ordres de la semaine se jouent la nuit de dimanche, avec des effets sur la carte (camions, fusillades, descentes, conquêtes) et un fil de la ville en direct. Les décisions (événements du jeudi et du dimanche) mettent le jeu en pause. « Aller à dimanche soir » résout la semaine tout de suite.
- **Alcool.** Les speakeasies vendent jusqu'à 18 caisses par semaine de ton stock (whisky, puis gin, puis bière), à un prix qui dépend de la clientèle du quartier. Sans stock, ils ne rapportent que l'entrée. Achat par le lac (−40 % sur le prix du marché, livré la nuit, risque d'interception réduit par l'escorte) ou au grossiste (immédiat, sûr, plus cher). Revente en gros pour profiter des pénuries. Les prix bougent chaque semaine avec des chocs (pénurie à Chicago, canicule…). La distillerie produit du gin, l'entrepôt ajoute du stockage.
- **Coups.** 3 ou 4 opportunités par semaine (dette, boxe truquée, braquage, témoin, camion ou cave d'un rival, incendie…). Une équipe, une stat (force ou discrétion), une chance exacte. Échec : heat, blessures ou prison.
- **Commerçants.** Deux par quartier. Tarif de protection bas, normal ou élevé, qui fait varier leur satisfaction. Sous 30 : protection ×0,6, plus de descentes, dénonciations. À 70 et plus : moins de descentes et +1 respect par semaine. Leurs demandes rapportent des **faveurs** (libérer un homme, alibi −12 heat) et parfois des prêts remboursés avec intérêts.
- **Diplomatie.** Une relation de −100 à 100 avec chaque famille. Dîner d'affaires, tribut payé ou exigé, alliance (relation ≥ 40), guerre, paix. Les rivaux envoient des ultimatums et proposent des alliances. Une relation haute les dissuade de t'attaquer, la guerre multiplie leur agressivité.
- **Corrano Herald.** Chaque semaine, la une du journal reprend l'événement le plus marquant.
- **Argent sale / propre.** Le blanchiment (Max, Moitié, Arrêt) passe le sale restant après les salaires en propre, avec 15 % de commission. Façades et enveloppes se paient en propre.
- **Territoire.** 9 quartiers en grille 3×3, attaques sur les voisins. Puissance = force des hommes (+2 par capo) + respect/20, contre la défense, ±25 % d'aléa de chaque côté.
- **Heat.** Monte avec les commerces illégaux, les assauts, les coups et le cash stocké. Au-dessus de 85, les fédéraux peuvent arrêter le Don, sauf juge acheté.
- **Hommes.** Chaque assaut, défense ou coup donne de l'expérience. À chaque niveau, +1 dans la stat la plus utilisée ; tous les deux niveaux, un trait (Tireur d'élite, Gueule cassée, Fantôme, Comptable, Chauffeur, Négociateur…). Rangs : Recrue, Soldat, Homme de confiance, Vétéran, Capo. Les 4 recrues sont renouvelées chaque semaine, avec leurs traits et parfois un défaut (Bavard, Cupide, Ivrogne, Trouillard). Les Dons rivaux ont aussi des traits, et en gagnent avec leurs victoires (Aguerri) ou leurs défaites contre toi (Revanchard).
- **Rang.** Petite bande → Famille de quartier → Famille établie → Grande famille → Capo dei Capi, selon le respect.
- **Victoire :** 9 quartiers, ou 7 quartiers et 100 de respect. **Défaite :** arrestation, plus aucun quartier, ou faillite sans hommes.

## Structure

```
src/
  types.ts      modèle de données
  data.ts       quartiers, établissements, alcools, tarifs, familles, noms
  state.ts      création de partie, sauvegarde, projection de la semaine (ventes, protection)
  engine.ts     actions du joueur et résolution de la semaine
  booze.ts      contrebande : achats, livraisons, revente, marché
  jobs.ts       coups : génération, équipes, résolution
  shops.ts      commerçants, tarifs, faveurs
  diplomacy.ts  relations, alliances, guerre, Corrano Herald
  events.ts     événements à choix
  street.ts     petites nouvelles de rue (cosmétique)
  traits.ts     traits, expérience et niveaux des hommes ; traits des Dons
  fx.ts         effets visuels : camions, fusillades, compteurs, une du journal
  ui.ts         rendu et interactions
  style.css     thème feutre, laiton et sang de bœuf
tests/          simulation, prévisions, calibration
```
