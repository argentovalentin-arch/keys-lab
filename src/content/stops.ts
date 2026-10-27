/**
 * The five stops along the route. Each stop sits on a camera waypoint
 * (see `at`) and carries a "how it’s made" sheet.
 * Facts flagged `live` are filled in at runtime from the actual scene.
 */
export interface Stop {
  /** Route progress where the stop sits: a camera waypoint, i / 5. */
  at: number;
  title: string;
  lead: string;
  /** World-space x/z of the marker; y is placed on the ground at runtime. */
  anchor: [number, number];
  /** Height of the marker above ground (or sea). */
  lift: number;
  sheet: {
    title: string;
    body: string[];
    facts: Array<{ label: string; value: string } | { label: string; live: LiveFact }>;
  };
}

export type LiveFact = 'terrainTriangles' | 'shrubs' | 'pines' | 'drawCalls' | 'triangles' | 'backend';

export const STOPS: Stop[] = [
  {
    title: 'Le large',
    at: 0,
    lead: 'Faites défiler pour approcher l’île.',
    anchor: [620, 250],
    lift: 44,
    sheet: {
      title: 'La mer',
      body: [
        'La mer est un seul plan, entièrement dessiné par un shader écrit en TSL, le langage de shaders de three.js. Il est traduit en WGSL pour WebGPU, ou en GLSL quand le navigateur retombe sur WebGL 2.',
        'Pour savoir où l’eau est profonde, le shader lit le relief de l’île stocké dans une texture. La profondeur décide de la couleur, du turquoise au bleu du large, et de l’écume qui roule vers le rivage.',
      ],
      facts: [
        { label: 'Carte de profondeur', value: '512 × 512, demi-flottants' },
        { label: 'Rendu', live: 'backend' },
      ],
    },
  },
  {
    title: 'La côte',
    at: 1 / 6,
    lead: 'Un relief qui n’a jamais été modélisé.',
    anchor: [175, 150],
    lift: 10,
    sheet: {
      title: 'Le relief',
      body: [
        'Aucun fichier 3D : l’île est calculée au chargement à partir d’un bruit de simplex. Plusieurs couches de bruit superposées donnent le relief, et une déformation du domaine découpe les baies et les caps.',
        'La couleur dépend de l’altitude et de la pente : sable au bord de l’eau, maquis sur les versants doux, roche là où c’est trop raide. Les facettes sont laissées visibles, c’est le parti pris graphique.',
      ],
      facts: [
        { label: 'Triangles du relief', live: 'terrainTriangles' },
        { label: 'Fichiers 3D chargés', value: 'aucun' },
      ],
    },
  },
  {
    title: 'Le maquis',
    at: 3 / 6,
    lead: 'Chaque buisson bouge avec le vent.',
    anchor: [140, 10],
    lift: 14,
    sheet: {
      title: 'La végétation',
      body: [
        'Buissons et pins sont placés par le code selon l’altitude, la pente et des zones de densité, puis dessinés par instanciation : la carte graphique reçoit une seule forme et la liste de ses positions.',
        'Le vent est calculé dans le vertex shader. Plus un point est haut dans la plante, plus il se balance, avec un décalage propre à chaque instance pour que rien ne bouge à l’unisson.',
      ],
      facts: [
        { label: 'Buissons', live: 'shrubs' },
        { label: 'Pins parasols', live: 'pines' },
      ],
    },
  },
  {
    title: 'Les crêtes',
    at: 4 / 6,
    lead: 'La lumière tourne avec la journée.',
    anchor: [40, 212],
    lift: 14,
    sheet: {
      title: 'La lumière',
      body: [
        'Le soleil, la lumière d’ambiance, le ciel, la brume et l’éclat de la mer suivent une même courbe, de la fin de matinée au crépuscule. Le défilement fait avancer l’heure.',
        'Toutes ces valeurs sont des uniforms : elles changent à chaque image sans recompiler un seul shader. Les ombres viennent d’une carte de 4096 × 4096 pixels qui suit le soleil.',
      ],
      facts: [
        { label: 'Appels de rendu par image', live: 'drawCalls' },
        { label: 'Triangles par image, ombres comprises', live: 'triangles' },
      ],
    },
  },
  {
    title: 'Les montagnes',
    at: 5 / 6,
    lead: 'Activez le son : rien n’est enregistré.',
    anchor: [-55, -130],
    lift: 16,
    sheet: {
      title: 'Le son',
      body: [
        'Toute l’ambiance sonore est calculée en direct avec la Web Audio API : la mer, la rivière, le vent, les oiseaux, les sonnailles. Aucun fichier audio n’est chargé.',
        'Chaque son part de bruit ou d’oscillateurs, sculptés par des filtres et des enveloppes, puis placé dans l’espace. Les ambiances se relaient au fil du parcours, et la rivière suit sa vraie position par rapport à la caméra. Une réverbération générée par le code les fond ensemble.',
      ],
      facts: [
        { label: 'Fichiers audio chargés', value: 'aucun' },
        { label: 'Réverbération', value: '3,2 s, calculée' },
      ],
    },
  },
  {
    title: 'Le soir',
    at: 1,
    lead: 'Fin du parcours.',
    anchor: [-20, 20],
    lift: 24,
    sheet: {
      title: 'Le ciel',
      body: [
        'Le ciel n’est pas une image : c’est un dégradé calculé pour chaque pixel selon la direction du regard, avec un disque solaire et un halo qui suivent la position du soleil.',
        'La couleur de l’horizon est aussi celle de la brume, ce qui fond l’île et la mer dans le ciel sans ligne de raccord.',
      ],
      facts: [
        { label: 'Images de ciel chargées', value: 'aucune' },
        { label: 'Rendu', live: 'backend' },
      ],
    },
  },
];
