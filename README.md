# Élő festmény (LivingPainting)

Szekérrel bejárható világ Csontváry Kosztka Tivadar *Vihar a nagy Hortobágyon* (1903) című festményében.
three.js (r187), WebGL2, build lépés nélkül.

**Játék:** https://mp3pintyo.github.io/LivingPainting/

## Helyi futtatás

```sh
npm run game   # játék:     http://127.0.0.1:8096/
npm run site   # bemutató:  http://127.0.0.1:8097/
```

Csak Node kell (függőség nélküli statikus szerver: `tools/serve.mjs`). A Playwright csak a képernyőkép-eszközökhöz.

## Felépítés

- `game/` — a játék (`src/` modulok, `assets/` textúrák és modellek, `vendor/three`)
- `site/` — a bemutató oldal; a játékot `jatek/?embed` módban iframe-ben vezérli
- `docs/` — a festői szabályok (`CSONTVARY_STILUS.md`) és a terv
- `tools/` — szerver, festmény-előkészítés, képernyőképek

Források és licencek: [CREDITS.md](CREDITS.md).
