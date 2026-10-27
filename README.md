# KEYS Lab

Le laboratoire de KEYS Performance : une île méditerranéenne générée par le code et rendue en temps réel dans le navigateur (three.js, WebGPU avec repli WebGL 2, TSL, Web Audio).

## Développement

```bash
npm install
npm run dev
```

Le site tourne sur http://localhost:5180.

## Production

```bash
npm run build
```

Le site statique est généré dans `dist/`. Chaque envoi sur la branche `main` le publie sur GitHub Pages (voir `.github/workflows/deploy.yml`).
