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
npx vite-node tests/circle.ts        # le cercle : vote de l'héritier (prévu = réel), prise du trône par la force
npx vite-node tests/endgame.ts       # expéditions, révoltes, brigade, élections (chances affichées = réelles)
npx vite-node tests/teams.ts         # spécialistes, bonus du Don, meilleure équipe
npx vite-node tests/network.ts       # réseau : approches (chance affichée = réelle), remplaçants, double jeu caché
npx vite-node tests/crews.ts         # équipes des capos : équilibre, postes, bonus, cascade, garde (chance affichée = réelle)
npx vite-node tests/sim.ts 300 --retire=50   # le bot prend sa retraite à la semaine 50
```

Options du bot : `--onecity` (reste à New Corrano), `--nocomm` (n'achète aucune voix), `--retire=N`.

Le bot ne gère ni la heat ni les commerçants : il sert à repérer les dérives, pas à mesurer la difficulté pour un humain. Repère v0.7 : un bot qui ignore la heat et le réseau finit surtout condamné ; s'il prend sa retraite à la semaine 30, il réussit dans 40 % des parties (score moyen ~2 200), à la semaine 50 dans 20 % (~4 200).

## Règles

- **Le départ.** Tu choisis le prénom du Don et le nom de la famille, puis la carte (au hasard ou classique). Ton oncle vient de tomber pour fraude fiscale : il te laisse Little Sicily, un speakeasy et quatre hommes. À toi de bâtir le reste.

- **Le temps passe.** Une horloge fait défiler les jours (×1, ×2, ×3, pause, barre d'espace). Les ordres de la semaine se jouent la nuit de dimanche, avec des effets sur la carte (camions, fusillades, descentes, conquêtes) et un fil de la ville en direct. Les décisions (événements du jeudi et du dimanche) mettent le jeu en pause. « Aller à dimanche soir » résout la semaine tout de suite.
- **Alcool.** Les speakeasies vendent jusqu'à 18 caisses par semaine de ton stock (whisky, puis gin, puis bière), à un prix qui dépend de la clientèle du quartier. Sans stock, ils ne rapportent que l'entrée. Achat par le lac (−40 % sur le prix du marché, livré la nuit, risque d'interception réduit par l'escorte) ou au grossiste (immédiat, sûr, plus cher). Revente en gros pour profiter des pénuries. Les prix bougent chaque semaine avec des chocs (pénurie à Chicago, canicule…). La distillerie produit du gin, l'entrepôt ajoute du stockage.
- **Coups.** 3 ou 4 opportunités par semaine parmi 15 (dette, boxe truquée, poker truqué, morphine de l'hôpital, grève à briser, braquage, témoin, convoi, camion ou cave d'un rival, débauchage de ses hommes, incendie…). Une équipe, une stat (force ou discrétion), une chance exacte. Chaque coup cherche un spécialiste : un homme qui a le bon trait (Comptable, Chauffeur, Négociateur, Tireur d'élite, Fantôme, Brute, Ancien infirmier, Recruteur…) apporte +3. Certains comptent sur le Don : s'il vient, la moitié de son Verbe ou de son Flair s'ajoute. « Meilleure équipe » choisit les hommes libres les plus utiles (le spécialiste d'abord) et s'arrête à 85 % ; pour un assaut, la réserve passe avant les gardes. Échec : heat, blessures ou prison.
- **Commerçants.** Deux par quartier. Tarif de protection bas, normal ou élevé, qui fait varier leur satisfaction. Sous 30 : protection ×0,6, plus de descentes, dénonciations. À 70 et plus : moins de descentes et +1 respect par semaine. Leurs demandes rapportent des **faveurs** (libérer un homme, alibi −12 heat) et parfois des prêts remboursés avec intérêts.
- **Diplomatie.** Une relation de −100 à 100 avec chaque famille. Dîner d'affaires, tribut payé ou exigé, alliance (relation ≥ 40), guerre, paix. Les rivaux envoient des ultimatums et proposent des alliances. Une relation haute les dissuade de t'attaquer, la guerre multiplie leur agressivité.
- **Corrano Herald.** Chaque semaine, la une du journal reprend l'événement le plus marquant.
- **Argent sale / propre.** Le blanchiment (Max, Moitié, Arrêt) passe le sale restant après les salaires en propre, avec 15 % de commission. Façades et enveloppes se paient en propre.
- **Territoire.** 9 quartiers en grille 3×3, attaques sur les voisins. Puissance = force des hommes (+2 par capo) + respect/20, contre la défense, ±25 % d'aléa de chaque côté.
- **Heat.** Retombe naturellement de 4 par semaine, plus 1 par tranche de 6 au-delà de 30 (la presse se lasse d'une heat haute). Monte avec les commerces illégaux, les assauts, les coups et le cash stocké : au-delà d'un seuil qui grandit avec la famille (10 000 $ pour une Petite bande, 20 000, 35 000, 50 000, puis 75 000 $ pour un Parrain), +1 heat par semaine et par tranche de 10 000 $. Elle attire les descentes et nourrit le dossier fédéral.
- **Dossier fédéral.** Monte avec la heat (+1 dès 40, +2 dès 55, +3 dès 75, +4 dès 90) et retombe quand elle est basse (−1 sous 40, −2 sous 20), avec la taille de l'empire (+1 par tranche de 5 quartiers), le Don vu sur une opération, les arrestations, les traîtres, les braquages et les scandales. À 100 : procès en 3 étapes (jury, témoin, avocat) puis verdict, chance d'acquittement exacte. Acquitté : le dossier repart à 20. Coupable : 20 ans, l'héritier reprend. La tendance de la semaine s'affiche à côté du dossier, en haut de l'écran.
- **Réseau.** Reporter et rédacteur en chef du Herald, capitaine et commissaire, greffier et procureur adjoint, maire, curé, orphelinat, agent fédéral. Chaque poste a son titulaire, avec un tempérament : vénal (facile à acheter, de plus en plus gourmand), prudent (dur à convaincre, deux fois moins de scandales), ambitieux (deux fois plus de double jeu), intègre (presque impossible à acheter, et s'il refuse il peut te dénoncer : +5 dossier). Pour l'acheter : l'enveloppe (une semaine d'avance), un intermédiaire parmi tes contacts (deux semaines, +25 %) ou le chantage (2 faveurs, +35 %, mais il trahit plus volontiers) ; chance exacte affichée, le Verbe du Don l'améliore, un refus ferme la porte quatre semaines. Une fois payé, il peut être démasqué (+12 heat, +6 dossier), abattu par une famille en guerre, muté, ou racheté en secret par un rival qui te déteste : il prend ton argent et ne fait plus rien, jusqu'à ce que tu le découvres (plus vite avec un consigliere fidèle) ; alors renvoyer, faire disparaître, ou doubler sa mise. Un poste vide est repris en 2 à 4 semaines par un nouveau titulaire, plus cher. Les élections changent le maire.
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
- **Les équipes des capos.** Chaque soldat appartient à une équipe : celle d'un capo (3 hommes, +1 tous les 2 niveaux du capo) ou la garde du Don (4 au plus). « Répartir les équipes » les forme équilibrées : la garde prend les meilleurs combattants et les plus fidèles, les autres sont distribués pour que les équipes aient la même force, un mélange de costauds et de discrets, des spécialistes étalés ; les frères d'armes restent ensemble, les rivaux sont séparés. Chaque capo est responsable de quartiers (« Répartir les quartiers », ou le menu Responsable de chaque quartier) ; chaque lundi, il poste lui-même ses hommes, les quartiers les plus exposés d'abord (frontière, guerre, expédition annoncée, revenus). Un poste choisi à la main reste fixé. Les recrues rejoignent l'équipe qui a le plus de place ; un nouveau capo prend les hommes sans équipe. *Commandement* : selon son trait, un capo donne un bonus à toute son équipe (Brute, Tireur, Tête brûlée, Gueule cassée : +1 de force ; Négociateur, Beau parleur : +1 satisfaction par semaine dans ses quartiers ; Comptable : +10 % de revenus dans ses quartiers ; Fantôme, Sang-froid : prison ÷2 ; Fidèle : loyauté jamais sous 40). *Loyauté en cascade* : les hommes se rapprochent chaque semaine de la loyauté de leur capo ; un capo qui trahit part avec ceux qui sont sous 50. *La garde* protège le Don des tueurs et des traîtres : un capo ambitieux qui frappe affronte la garde (chance exacte affichée), et elle se bat pour l'héritier. « Envoyer l'équipe de… » en un clic sur un coup ou un assaut.
- **Les onglets s'ouvrent au fil de la partie.** Au départ : Quartier, Le Don, Alcool, Coups, Famille, Journal. Puis Rivaux (semaine 3 ou premier combat), Réseau (heat 30, dossier qui monte ou 15 de respect), Villes (35 de respect), Commission (60 de respect, ou une motion qui te vise), Cercle (premier enfant, ou le Don à 55 ans). Le consigliere annonce chaque ouverture, et l'onglet porte un badge « nouveau ».
- **L'onglet Famille.** Trois sous-onglets : Hommes, Recrutement, Liens. Une ligne par homme (Force, Discrétion, loyauté, poste) qu'un clic déplie en fiche complète. Filtres rapides (en réserve, à risque, fidèles, inactifs, capos, blessés et prison), par quartier, ville ou trait ; tris par loyauté, force, discrétion, niveau, salaire, inactivité ; regroupement par quartier. Un homme resté 4 semaines en réserve sans rien faire porte un badge « inactif ».
- **Hommes.** Chaque assaut, défense ou coup donne de l'expérience. À chaque niveau, +1 dans la stat la plus utilisée ; tous les deux niveaux, un trait (Tireur d'élite, Gueule cassée, Fantôme, Comptable, Chauffeur, Négociateur…). Rangs : Recrue, Soldat, Homme de confiance, Vétéran, Capo. Les 4 recrues sont renouvelées chaque semaine, avec leurs traits et parfois un défaut (Bavard, Cupide, Ivrogne, Trouillard). Les Dons rivaux ont aussi des traits, et en gagnent avec leurs victoires (Aguerri) ou leurs défaites contre toi (Revanchard).
- **Le Don.** Ton personnage : Poigne, Ombre, Verbe, Flair, expérience double, et des points à placer en stats ou en talents (Boucher, Renard, Parrain : 5 talents chacun). Il peut monter au front (assauts, coups) : +2 par homme à ses côtés, +2 respect, mais +5 heat (vu sur les lieux), blessures, cicatrices, arrestation ou mort.
- **La famille du Don.** Rencontres (chanteuse, héritière, fille de commerçant, fille d'un Don rival qui scelle une alliance), cour, mariage, épouse avec traits et affection, grossesse, naissances, éducation à 6 et 12 ans, entrée dans les affaires à 16 ans. 1 an = 6 semaines. Si le Don meurt ou tombe pour 20 ans, l'héritier reprend avec la moitié de ses talents ; s'il est mineur, un régent tient la famille ; sans enfant, la partie s'achève.
- **Le cercle.** Une fois Don, la famille ne disparaît pas : ton mentor devient consigliere, les anciens restent, et les capos aussi, y compris ceux qui ont voté contre toi et le favori battu, qui gardent rancune (loyauté basse, prétendants naturels). En partie rapide, le Don a déjà son consigliere et deux anciens. Un consigliere à 40 d'affinité ou plus apaise les rancunes et te prévient quand un ancien monte un capo contre toi. Les anciens vieillissent et meurent ; d'autres prennent leur place. Cadeaux (800 $, toutes les deux semaines) pour l'affinité ou la loyauté.
- **Le vote de l'héritier.** Quand le Don tombe, l'héritier adulte doit gagner le même vote que toi : le consigliere, les anciens et les capos choisissent entre lui et le capo le plus ambitieux. Chacun soutient l'héritier si ce qu'il pense du Don (affinité ou loyauté divisée par deux), plus le poids de l'héritier (présentations au cercle +8 jusqu'à 40, +3 par niveau, +3 par étape d'éducation), dépasse son attachement au prétendant (25 pour un capo, 45 s'il est rancunier). L'onglet Cercle affiche le résultat si le Don tombait aujourd'hui. Gagné : ceux qui ont voté contre gardent rancune. Perdu : s'incliner (fin de la lignée) ou prendre le trône par la force, chance exacte affichée. À la fin d'une régence, le régent est le prétendant.
- **Les menaces d'une grande famille.** *Expéditions* : dès 3 quartiers, et 7 quartiers ou 35 de respect, une famille d'une autre ville peut débarquer dans un de tes quartiers (jamais Little Sicily), annoncée deux semaines à l'avance avec sa force et ta chance exacte de tenir ; poste des hommes ou paie-les pour qu'ils restent chez eux. *Révoltes* : trois semaines d'affilée sous 25 de satisfaction, les commerçants se soulèvent (apaiser, écraser, ou perdre le quartier). *Brigade fédérale* : à partir de 8 quartiers ou 100 de respect, avec un dossier à 45, Washburn envoie l'agent Dutton pour 10 semaines (descentes ×1,6, flics payés deux fois moins efficaces, +2 dossier par semaine).
- **La politique.** *Élections municipales* toutes les 16 semaines : finance la campagne de Thornton (2 000 $ par versement, jusqu'à 20 000 $) contre la réformatrice Harriet Cole ; chance exacte affichée. Ton maire : descentes −15 %, −1 heat par semaine ; la réformatrice : +25 %, +1 heat. *Le sénateur Whitcombe* (Grande famille) : 25 000 $ propres puis 1 500 $ par semaine, −2 dossier par semaine, plus de brigade, +15 points aux élections, 1 % de scandale par semaine. *Galas de charité* : 5 000 $, puis 10 000 $, 15 000 $… toutes les 6 semaines, +5 respect, −8 heat, −3 dossier.
- **Le consigliere.** En haut de l'écran, ton consigliere donne chaque lundi les trois points les plus urgents (procès, dossier, heat, salaires impayés, rupture d'alcool, coalition, enquêteurs, vendettas, vote de la Commission, ville sans gouverneur, hommes peu loyaux, succession…), chacun avec un lien vers le bon onglet. Il ouvre la semaine avec le bilan de la précédente : argent sale et propre, respect, heat, dossier, quartiers pris et perdus. Il signale aussi les hommes laissés en réserve depuis un mois.
- **Courbes.** Le Journal trace l'argent, la heat, le dossier et le respect semaine après semaine, avec la valeur exacte au survol.
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
  endgame.ts    expéditions, révoltes, brigade fédérale, élections, sénateur, galas
  circle.ts     le cercle du Don : consigliere, anciens, rancunes, vote de l'héritier
  advisor.ts    le consigliere : conseils du lundi et bilan de la semaine
  cities.ts     villes, voyages, gouverneurs, implantation
  commission.ts Commission des Dons : motions, votes, pactes, trahisons
  score.ts      fin choisie et score final
  bonds.ts      frères d'armes et rivalités
  vendetta.ts   tueurs nommés et vengeance
  hunters.ts    la journaliste et l'inspecteur
  heist.ts      grands coups en trois semaines
  mapgen.ts     carte générée
  buildings.ts  effets des bâtiments, améliorations, emplacements
  teams.ts      la meilleure équipe en un clic (coups, assauts, grand coup)
  crews.ts      équipes des capos : répartition, quartiers, poste automatique, cascade, trahison
  command.ts    commandement des capos (bonus selon le trait)
  unlocks.ts    onglets débloqués au fil de la partie
  pressure.ts   coalition, capos ambitieux, tentatives d'assassinat
  objectives.ts contrats à moyen terme
  fx.ts         effets visuels : camions, fusillades, compteurs, une du journal
  ui.ts         rendu et interactions
  style.css     thème feutre, laiton et sang de bœuf
tests/          simulation, prévisions, calibration
```
