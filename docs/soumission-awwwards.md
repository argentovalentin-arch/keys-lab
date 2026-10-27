# KEYS Lab — dossier de soumission Awwwards

Brouillon préparé pour la soumission. Les éléments marqués **[à compléter]** dépendent de décisions ou d'informations que seul KEYS peut fournir. Vérifier les champs et formats d'images exacts demandés par le formulaire Awwwards au moment de soumettre.

## Fiche

- **Titre :** KEYS Lab
- **URL :** https://lab.keysperformance.com **[à confirmer une fois en ligne]**
- **Pays :** France
- **Langue du site :** français
- **Studio / auteur :** KEYS Performance **[à compléter : noms et rôles de l'équipe]**

## Description courte

Une île méditerranéenne entièrement générée par le code et rendue en temps réel dans le navigateur. On la parcourt en faisant défiler la page, du large jusqu'au soir : la lumière tourne avec la journée, le maquis bouge au vent, et chaque étape explique comment elle est faite.

## Description longue

KEYS Lab est le laboratoire de KEYS Performance, cabinet de conseil en stratégie et performance digitale basé en Corse. L'expérience montre ce que l'équipe sait construire, sans aucun fichier 3D, image ou son préenregistré : tout est calculé au chargement ou en direct.

Le parcours suit six étapes — le large, la côte, le maquis, les crêtes, les montagnes, le soir. La caméra est guidée par le défilement. Le soleil, le ciel, la brume et l'éclat de la mer évoluent ensemble de la fin de matinée au crépuscule. À chaque étape, un marqueur ouvre une fiche « comment c'est fait » qui détaille la technique, avec des chiffres mesurés en direct sur l'appareil du visiteur (triangles, appels de rendu, moteur utilisé).

L’ambiance sonore est elle aussi générative (Web Audio) : vagues et mouettes, rivière, oiseaux et cigales du maquis, alouette et sonnailles sur les crêtes, vent et rapaces en montagne, puis un ressac calme et un merle au coucher du soleil. Le son est coupé par défaut.

## Points techniques à mettre en avant

- **Rendu WebGPU** avec three.js (r186) et repli automatique sur WebGL 2.
- **Shaders écrits en TSL**, traduits en WGSL ou GLSL selon le navigateur.
- **Île procédurale** : bruit de simplex en plusieurs octaves, déformation de domaine pour la côte, couleurs selon altitude et pente. Environ 180 000 triangles de relief, aucun modèle importé.
- **Mer en shader** : la profondeur est lue dans une carte de hauteur (512 × 512, demi-flottants) et pilote la couleur et l'écume animée.
- **Végétation instanciée** : jusqu'à 14 000 buissons et 900 pins parasols, deux appels de rendu, vent calculé dans le vertex shader.
- **Cycle de lumière piloté par le défilement**, sans recompilation de shader (uniforms), ombres en temps réel.
- **Ciel procédural** : dégradé, disque solaire et halo calculés par pixel.
- **Audio génératif** Web Audio : bruit brun filtré, synthèse des cris, réverbération par convolution générée par le code.
- **Qualité adaptative** : trois niveaux choisis selon l'appareil, abaissés automatiquement si la fluidité chute.
- **Accessibilité** : navigation par étapes au clavier, fiches en `<dialog>` modales, description textuelle pour les lecteurs d'écran, respect de la préférence « réduire les animations ».

## Technologies (tags)

three.js, WebGPU, WebGL, TSL, WGSL, GLSL, Web Audio API, GSAP, Lenis, Vite, TypeScript

## Typographies

- Bodoni Moda (titres)
- Archivo (texte)

## Couleurs

| Rôle | Hex |
|---|---|
| Crème (fond, horizon) | #F4ECDC |
| Encre (texte) | #1F2430 |
| Mer | #2F6F7A |
| Lagune | #86C3B5 |
| Maquis | #6F7D45 |
| Ciel du soir | #F2B48A |

## Catégories envisagées **[à choisir]**

Expérimental, 3D, Animation, Storytelling, Son, WebGL / WebGPU.

## Visuels à produire **[à compléter]**

Captures en haute résolution de chaque étape (le large, la côte avec un marqueur, le maquis, les crêtes, le soir), une capture d'une fiche « comment c'est fait » ouverte, et éventuellement une courte vidéo du parcours complet. À faire sur la version en ligne, en qualité « élevée » (`?quality=high`).

## À vérifier avant de soumettre

- Le site est en ligne sur son URL définitive, en HTTPS.
- Le chargement est correct sur Chrome, Safari et Firefox récents, sur ordinateur et sur mobile.
- Le repli WebGL 2 charge dans un délai acceptable (voir les limites connues dans le compte rendu de l'étape 4).
- Les textes des fiches ont été relus par KEYS.
