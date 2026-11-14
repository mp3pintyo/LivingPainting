# Élő festmény (LivingPainting) — projektszabályok

Szekérrel bejárható világ Csontváry Kosztka Tivadar *Vihar a Nagy Hortobágyon* (1903) című festményében.
Ötlet: a starrynightrider.com (Van Gogh, three.js + procedurális világ). A mi változatunk saját kód.

Bemutató oldal: `npm run site` → http://127.0.0.1:8097/ (`site/`; a játékot `/jatek/?embed` módban iframe-ben vezérli:
`__game.show(pose)`, `__game.setLook({...})`; képek: `node tools/site-shot.mjs [--phone]`). Új technika → új fejezet is.
Játék: `npm run game` → http://127.0.0.1:8096/  (`?play` egyből játék, `?view` a nyitónézet, `?stats` FPS,
`?q=low|medium|high` az olajszűrő, `?noshadow`, `?lowres`, `?small` kis textúra, `?hatch=0` vonalkák nélkül,
`?matte=0` lakkos mélységgel, `?cedarsky=0` a cédrus saját ege nélkül, `?townshadow=0` mostari árnyék nélkül).
HUD-demó: `/hud-test.html`.

## Irány (a felhasználó döntései)

- **Csak Csontváry.** Egy festő, egy kéz. Más festő stílusa nem kerülhet a világba, és Csontváryt sem festjük más
  kezével (nincs Van Gogh-örvény, nincs ecsetfolt-minta az égen).
- **A képi világ legyen minél inkább Csontváry, ne „számítógépes”.** A szabályok: `docs/CSONTVARY_STILUS.md`
  (vékony festék és átütő vászon, impasztó csak a fehéren, naiv lapos alakok sötétedő széllel, vetett árnyék alig,
  sötét előtér-sáv, a tükröződés függőlegesen elkenődik; a dombok, a hegy és a szikla formát követő vonalkákból;
  matt, lakk nélküli felület). Új elemet ezek szerint kell festeni.
- Az ég a *Vihar* (kivétel: a cédrus dombjánál fokozatosan a *Magányos cédrus* ege); közép a Hortobágy; körülötte sűrűn, néhány száz méteren belül: csárda és hídi vásár, tanyák,
  kunhalmok, ménes csikósokkal, a cédrusos domb a türkiz tóval (*A magányos cédrus*), Mostar szurdoka a második
  híddal (*Római híd Mosztárban*). A festmény saját látószögébe (északra) nem kerülhet olyan, ami nincs a képen.
- Tablók más képeiből (2. bővítés): *Sétalovaglás a tengerparton* és *Halászat Castellammaréban* (tóparti sétány
  lovasokkal, halászokkal, lámpákkal, csónakokkal), *Hídon átvonuló társaság* (patak, kis kőhíd, lovas társaság),
  *Vihar a pusztán* (ponyvás szekér, pihenők), *Tavasz Mosztárban* és *Mandulavirágzás* (virágzó fák, mandulás
  kőfalakkal), *Jajcei vízesés* és *Villanyvilágított fák* (vízesés a szurdokban, villanytelep, lámpás út).
  A festménylista: hu.wikipedia „Csontváry Kosztka Tivadar festményeinek listája” (102 tétel).
- Jármű: lovas **szekér**. Játék: „Napút” — napfénycseppek a Kilenclyukú hídra; minden leadás visszaszorítja a vihart.
- Stack: three r187 (`game/vendor`, build nélkül, importmap), **WebGL2**.

## Felépítés (`game/src/`)

- `paint.js` — közös GLSL (zaj, `dab`, `hatch` vonalkák a talaj kiemelkedésein, az ég, pára, árnyék) és a
  `paintMaterial(kind)`; a `beast`/`cloth` fajta „naiv”
  alakárnyalással fest (egytónus, sötétedő szél, impasztó-kéreg). Skinning-képes.
- `sky.js` — kupola (vászon + körbefutó szélszínek + felhők + villám). `post.js` — tónus → olajszűrő (Kuwahara) →
  izzás → végső: kézremegés, festékdomborulat, körvonal-sáv, vászonszövés, sötét előtér-sáv, galéria + feloldódás.
- `world.js` — terep, folyó/tó/szurdok, utak, hidak (`BRIDGES`), épületek, ütközés, `mapData`, `landmarks`, `orbSpots`.
- `models.js`, `models2.js` — procedurális modellek; `animals.js` — Quaternius CC0 animált ló/marha/kutya
  (`assets/models`), átszínezve, a szürke marhán lírás szarv a fejcsonton.
- `fauna.js` — csordák (marha, ménes), lovasok (csikósok, zarándokok), kutya, napfénycseppek; `cart.js` — szekér, kamera.
- `minimap.js`, `highlights.js`, `board.js` (+ `css/hud2.css`) — minitérkép, helyszínlista (Tab), helyi ranglista.
- `audio.js` — szintetizált hangok.
- `touch.js` — érintéses vezérlés (`body.touch`): bal oldalt lebegő joystick (fokozatos gáz és kormány), jobb oldalt
  húzás = körülnézés, két ujj = közel/távol, ostor-gomb a minitérkép mellett. Telefonon (`max-width: 640px` vagy
  `max-height: 520px`) a HUD összehúzódik, a helyszínlista egy sor (koppintás = következő cél).
- Az „Oil paint” (patch.gg, MIT) nyomán: `brush.js` (ecsetlap), `animaldabs.js` (festékfoltok a legközelebbi állatokon,
  `?dabs=0` kikapcsolja), `lights.js` (összeadódó lámpafény-vonások + `uLamps`), a `paint3` három színkeverék, a lakk.
  Források, licencek: `CREDITS.md`. Remegésmérés: `node tools/steady.mjs` (alacsonyabb = nyugodtabb festék; `--at=x,y,z,lx,ly,lz` máshol mér).

## Munkaszabályok

- **Festmény-előkészítés:** `npm run paint` (`tools/prepare_painting.py`). Forrás: Commons közkincs (`source/paintings/`).
- **Fizetős generálás** (fal.ai): előtte költségbecslés és jóváhagyás. Kép: `openai/gpt-image-2.6/sunburst/edit`,
  **quality: medium**. Minden prompt a `source/paintings/prompts.json`-ba.
- **Képernyőkép elszigetelten:** `node tools/shot.mjs <lépések.json>` (Playwright 1.64.1, `"mobile": true` telefon érintéssel; kézzel léptetett képkockák:
  `window.__game`, `g.autoplay = true`, `g.frame(1/60)`); HUD: `node tools/hud-shot.mjs`. A felhasználó Chrome-ját nem
  zavarja. Lépésfájlok és képek: `test-results/`.
- Új tartalom: adat a `world.js` / `fauna.js` tetején (pontlisták), ne szórványos kódban.
- **Modell a festményről:** az arányokat a képen kell kimérni (képpontban), és a festő szemén át visszavetíteni
  (`world.js` `EYE`), nem szemre becsülni. A ferdén látott homlokzat szélességei rövidülnek. A színt is mérni kell.
  A mért értékek a `docs/CSONTVARY_STILUS.md` „A modellek a festmények szerint” részében vannak.
- Commit csak a felhasználó kérésére.
