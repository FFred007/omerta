# Omertà

Jeu de gestion de mafia au tour par tour dans le navigateur. New Corrano, en pleine Prohibition : tu reprends une petite famille, tu fais tourner la contrebande, tu montes des coups, tu tiens tes commerçants et tu t'implantes dans d'autres villes, tu manœuvres à la Commission des Dons pour devenir le Capo dei Capi, et tu choisis toi-même quand quitter la scène.

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
npx vite-node tests/cities.ts        # villes, gouverneurs, Commission, fin choisie, migration
npx vite-node tests/v08.ts           # liens, vendettas, traqueurs, grands coups (chance affichée = réelle)
npx vite-node tests/mapgen.ts        # 1 000 cartes générées : jouables et toutes différentes
npx vite-node tests/buildings.ts     # bâtiments, améliorations, emplacements, prévisions exactes
npx vite-node tests/sim.ts 300 --retire=50   # le bot prend sa retraite à la semaine 50
```

Options du bot : `--onecity` (reste à New Corrano), `--nocomm` (n'achète aucune voix), `--retire=N`.

Le bot ne gère ni la heat ni les commerçants : il sert à repérer les dérives, pas à mesurer la difficulté pour un humain. Repère v0.7 : un bot qui ignore la heat et le réseau finit surtout condamné ; s'il prend sa retraite à la semaine 30, il réussit dans 40 % des parties (score moyen ~2 200), à la semaine 50 dans 20 % (~4 200).

## Règles

- **Le temps passe.** Une horloge fait défiler les jours (×1, ×2, ×3, pause, barre d'espace). Les ordres de la semaine se jouent la nuit de dimanche, avec des effets sur la carte (camions, fusillades, descentes, conquêtes) et un fil de la ville en direct. Les décisions (événements du jeudi et du dimanche) mettent le jeu en pause. « Aller à dimanche soir » résout la semaine tout de suite.
- **Alcool.** Les speakeasies vendent jusqu'à 18 caisses par semaine de ton stock (whisky, puis gin, puis bière), à un prix qui dépend de la clientèle du quartier. Sans stock, ils ne rapportent que l'entrée. Achat par le lac (−40 % sur le prix du marché, livré la nuit, risque d'interception réduit par l'escorte) ou au grossiste (immédiat, sûr, plus cher). Revente en gros pour profiter des pénuries. Les prix bougent chaque semaine avec des chocs (pénurie à Chicago, canicule…). La distillerie produit du gin, l'entrepôt ajoute du stockage.
- **Coups.** 3 ou 4 opportunités par semaine (dette, boxe truquée, braquage, témoin, camion ou cave d'un rival, incendie…). Une équipe, une stat (force ou discrétion), une chance exacte. Échec : heat, blessures ou prison.
- **Commerçants.** Deux par quartier. Tarif de protection bas, normal ou élevé, qui fait varier leur satisfaction. Sous 30 : protection ×0,6, plus de descentes, dénonciations. À 70 et plus : moins de descentes et +1 respect par semaine. Leurs demandes rapportent des **faveurs** (libérer un homme, alibi −12 heat) et parfois des prêts remboursés avec intérêts.
- **Diplomatie.** Une relation de −100 à 100 avec chaque famille. Dîner d'affaires, tribut payé ou exigé, alliance (relation ≥ 40), guerre, paix. Les rivaux envoient des ultimatums et proposent des alliances. Une relation haute les dissuade de t'attaquer, la guerre multiplie leur agressivité.
- **Corrano Herald.** Chaque semaine, la une du journal reprend l'événement le plus marquant.
- **Argent sale / propre.** Le blanchiment (Max, Moitié, Arrêt) passe le sale restant après les salaires en propre, avec 15 % de commission. Façades et enveloppes se paient en propre.
- **Territoire.** 9 quartiers en grille 3×3, attaques sur les voisins. Puissance = force des hommes (+2 par capo) + respect/20, contre la défense, ±25 % d'aléa de chaque côté.
- **Heat.** Monte avec les commerces illégaux, les assauts, les coups et le cash stocké. Elle attire les descentes et nourrit le dossier fédéral.
- **Dossier fédéral.** Monte avec la heat (+1 dès 40, jusqu'à +10 dès 90), la taille de l'empire, le Don vu sur une opération, les arrestations, les traîtres, les braquages et les scandales. À 100 : procès en 3 étapes (jury, témoin, avocat) puis verdict, chance d'acquittement exacte. Coupable : 20 ans, l'héritier reprend.
- **Réseau.** Reporter et rédacteur en chef du Herald, capitaine et commissaire, greffier et procureur adjoint, maire, curé, orphelinat, agent fédéral : mensualités et actions ponctuelles, introductions, avidité, scandales, rachat par un rival.
- **Villes.** New Corrano, Port Halloran (le port : contrebande −15 % et moins risquée), Mirage Springs (la ville du jeu : tripots ×1,5) et Washburn (la capitale : dossier −1 par quartier tenu). Chacune a ses familles, qui vivent et se battent même sans toi. On s'implante en achetant la gare avec une équipe menée par un capo, qui devient gouverneur. Le Don n'est que dans une ville à la fois : les coups viennent là où il est. Une ville sans le Don ni gouverneur rapporte 30 % de moins et ses hommes perdent en loyauté. Un gouverneur peu loyal peut faire sécession. Voyage : 150 $ par homme, une semaine sans assaut.
- **Paliers de puissance.** Petite bande, Famille de quartier (le juge), Famille établie (2 villes, le conseiller), Grande famille (3 villes, candidature à la Commission), Parrain (4 villes, présidence, légitimité).
- **Commission des Dons.** Toutes les 4 semaines, les 8 familles du pays votent une motion annoncée à l'avance : admission du joueur, présidence (Capo dei Capi), mise au ban du joueur (coalition de 8 semaines) ou d'un rival, trêve générale, ouverture des quais, dîme. Chaque Don a une position (pour, contre, indécis avec sa probabilité). Les voix s'achètent ou se promettent par pacte (6 semaines de paix), et un Don peut trahir sa parole. Violer une trêve de la Commission coûte la face.
- **Bâtiments.** 21 types. Illégal : speakeasy, tripot, distillerie, paris, imprimerie de faux billets (+1 dossier/sem.), usurier (revenu selon la satisfaction, qu'il fait baisser), salle de boxe (recrues +1 force), armurerie (+1 puissance par homme posté qui part à l'assaut, +4 défense), planque (prison plus courte, Don mieux gardé). Légal : blanchisserie, restaurant, garage, entrepôt, hôtel (+600 propre, +1 respect), club de jazz, cinéma, taxis (livraisons plus sûres), caisse de crédit (60 respect, commission −5 points). Par ville : quai privé (Port Halloran), casino (Mirage Springs), cabinet de lobbying (Washburn, −2 dossier/sem.). Huit bâtiments s'améliorent au niveau 2 (club chic, salle de jeu de luxe, grande distillerie…). Chaque quartier peut être agrandi jusqu'à 5 emplacements (2 500 à 8 000 $ propres).
- **Liens entre les hommes.** Trois opérations ensemble font des frères d'armes (+1 par paire dans une même équipe). Une promotion ou une bagarre crée des rivaux (−2 par paire, −1 loyauté par semaine s'ils gardent le même quartier).
- **Vendettas.** Un homme tué par une famille donne un nom de tueur. Pendant 10 semaines, un coup de vengeance est proposé dans sa ville (+2 par frère d'armes de la victime dans l'équipe). Vengé : +6 respect, +15 loyauté aux vengeurs. Impuni : −4 respect, −15 aux vengeurs, certains partent.
- **Ceux qui te traquent.** Clara Whitfield (journaliste) et l'inspecteur Hollis Garrity (Prohibition) enquêtent chaque semaine selon la heat et tes affaires. À 100 : une enquête en une, ou une opération coup de poing. Déjeuner, acheter, menacer, discréditer, faire muter, faire disparaître : chaque action a sa chance exacte, ils s'en souviennent, et leurs remplaçants sont plus intègres.
- **Grands coups.** Une offre de temps en temps, selon la ville du Don : repérages (test de discrétion), préparation (plans, spécialiste, faux papiers, flic payé), jour J. L'équipe est bloquée trois semaines, le risque de fuite monte, la chance affichée est exacte. Butin de 18 000 à 33 000 $.
- **Carte générée.** Chaque nouvelle partie tire ses quartiers, leur place et les territoires des familles (carte classique au choix).
- **Pression.** Un capo ambitieux peu loyal peut tenter un coup d'État ; les ennemis jurés tentent d'assassiner le Don.
- **Contrats.** Trois objectifs à moyen terme en permanence, avec échéance et récompense.
- **Hommes.** Chaque assaut, défense ou coup donne de l'expérience. À chaque niveau, +1 dans la stat la plus utilisée ; tous les deux niveaux, un trait (Tireur d'élite, Gueule cassée, Fantôme, Comptable, Chauffeur, Négociateur…). Rangs : Recrue, Soldat, Homme de confiance, Vétéran, Capo. Les 4 recrues sont renouvelées chaque semaine, avec leurs traits et parfois un défaut (Bavard, Cupide, Ivrogne, Trouillard). Les Dons rivaux ont aussi des traits, et en gagnent avec leurs victoires (Aguerri) ou leurs défaites contre toi (Revanchard).
- **Le Don.** Ton personnage : Poigne, Ombre, Verbe, Flair, expérience double, et des points à placer en stats ou en talents (Boucher, Renard, Parrain : 5 talents chacun). Il peut monter au front (assauts, coups) : +2 par homme à ses côtés, +2 respect, mais +5 heat (vu sur les lieux), blessures, cicatrices, arrestation ou mort.
- **La famille du Don.** Rencontres (chanteuse, héritière, fille de commerçant, fille d'un Don rival qui scelle une alliance), cour, mariage, épouse avec traits et affection, grossesse, naissances, éducation à 6 et 12 ans, entrée dans les affaires à 16 ans. 1 an = 6 semaines. Si le Don meurt ou tombe pour 20 ans, l'héritier reprend avec la moitié de ses talents ; s'il est mineur, un régent tient la famille ; sans enfant, la partie s'achève.
- **Portraits.** Générés en SVG (gravure de journal), ils évoluent avec l'âge, les cicatrices et le rang.
- **Fin choisie.** Pas de victoire automatique. À partir de la semaine 12, le Don peut prendre sa retraite (score ×1), ou se ranger s'il est Parrain, siège à la Commission, a 30 000 $ propres, un dossier ≤ 30 et une heat ≤ 30 (score ×1,5). Le score additionne fortune, quartiers, villes, établissements, respect, Commission, hommes, famille et générations, moins le dossier et la heat. Mort ou condamné sans héritier : ×0,5 ; plus aucun quartier : ×0,25. Le record est gardé dans le navigateur.

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
  don.ts        le Don : stats, talents, points, vieillissement
  family.ts     épouse, cour, mariage, enfants, héritier, succession, régence
  portraits.ts  portraits SVG générés
  network.ts    réseau d'influence
  dossier.ts    dossier fédéral et procès
  cities.ts     villes, voyages, gouverneurs, implantation
  commission.ts Commission des Dons : motions, votes, pactes, trahisons
  score.ts      fin choisie et score final
  bonds.ts      frères d'armes et rivalités
  vendetta.ts   tueurs nommés et vengeance
  hunters.ts    la journaliste et l'inspecteur
  heist.ts      grands coups en trois semaines
  mapgen.ts     carte générée
  buildings.ts  effets des bâtiments, améliorations, emplacements
  pressure.ts   coalition, capos ambitieux, tentatives d'assassinat
  objectives.ts contrats à moyen terme
  fx.ts         effets visuels : camions, fusillades, compteurs, une du journal
  ui.ts         rendu et interactions
  style.css     thème feutre, laiton et sang de bœuf
tests/          simulation, prévisions, calibration
```
