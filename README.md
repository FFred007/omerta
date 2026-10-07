# Omertà

Jeu de gestion de mafia au tour par tour dans le navigateur. New Corrano, 1925, en pleine Prohibition : tu reprends une petite famille et tu dois devenir le Capo dei Capi.

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

## Équilibrage

```bash
npm test 400    # simule 400 parties jouées par un bot naïf
```

Le bot ne sert qu'à repérer les dérives (parties trop courtes, rivaux trop forts). Repère actuel : environ 35 % de victoires pour le bot, fin de partie médiane vers la semaine 25.

## Règles

- **Tour = 1 semaine.** Tu donnes tes ordres, puis « Fin de semaine ».
- **Argent sale / propre.** Les rackets et commerces illégaux produisent du sale. Les façades (blanchisserie, restaurant, garage) le blanchissent avec 15 % de commission. Les façades et les pots-de-vin se paient en propre.
- **Territoire.** 9 quartiers en grille 3×3. Tu n'attaques que les quartiers voisins des tiens. Puissance de l'assaut = force des hommes engagés (+2 par capo) + respect/20, contre la défense du quartier, avec ±25 % d'aléa de chaque côté.
- **Après un assaut.** Les hommes engagés récupèrent une semaine. Un quartier conquis rapporte moitié moins pendant 3 semaines.
- **Hommes.** Force, discrétion, loyauté, salaire. Un capo donne +20 % de revenus à son quartier. Sous 25 de loyauté, un homme peut trahir (défection ou balance).
- **Heat.** Monte avec les commerces illégaux, les assauts et le cash sale stocké au-delà de 10 000 $. Elle déclenche des descentes. Au-dessus de 85, les fédéraux peuvent arrêter le Don, sauf si un juge est acheté.
- **Rivaux.** Castellano, Irlandais de Kilbride et clan Wolska recrutent, attaquent les quartiers faibles et se font la guerre entre eux.
- **Victoire :** 9 quartiers, ou 7 quartiers et 100 de respect. **Défaite :** arrestation, plus aucun quartier, ou faillite sans hommes.

## Structure

```
src/
  types.ts    modèle de données
  data.ts     quartiers, établissements, familles, noms
  state.ts    création de partie, sauvegarde localStorage, calculs dérivés
  engine.ts   actions du joueur et résolution de la semaine
  events.ts   événements aléatoires à choix
  ui.ts       rendu et interactions
  style.css   thème feutre, laiton et sang de bœuf
tests/sim.ts  simulation d'équilibrage
```
