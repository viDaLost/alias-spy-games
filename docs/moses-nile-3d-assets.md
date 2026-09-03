# Moses Nile 3D asset credits

## Closed woven basket

- Base model: **Woven basket low poly**
- Author: **FunWithBlender**
- Source: https://sketchfab.com/3d-models/woven-basket-low-poly-e544ba80962043448ab96498a7696310
- License: **CC Attribution / CC BY**
- Project modification: geometry extracted from the user-supplied GLB, re-oriented to Y-up and stored as a lightweight OBJ. V7.3+ turns the open basket into a visually closed basket at runtime with a woven lid, rim and handle while preserving the original base geometry and lightweight woven material.

## Crocodile

- Model: **crocodile high quality**
- Author: **Beerus**
- Original source: https://sketchfab.com/3d-models/crocodile-high-quality-a242e4634a234d3fb909c54b2c39d7b8
- License: **CC BY 4.0**
- Repository mirror used by the preview build: `sandeshdamkondwar/3d-viewer`, pinned to commit `a33f107378e79b4458d2a400bb5e32fddcedbf73`.
- V7.3 uses this higher-detail model for gameplay crocodiles instead of the previous procedural box/cone crocodile. V7.3.1+ resizes embedded textures to a maximum of 512 px during the preview build when the optimizer is available; if optimization fails, the original licensed GLB is retained.
- V7.5.1 extracts the verified packaged copy to `models/v73/crocodile.glb` in the active same-origin build. The box/cone mesh is now only an emergency load-failure fallback.

## Nile lotus

- Primary V7.3.2 model: project-owned low-poly OBJ at `web/games/moses-nile-v7/models/lotus-flower.obj`.
- The geometry was created specifically for this game: three radial petal layers, a raised flower center and small stamens, with no external textures or third-party model dependency.
- Geometry budget: **957 vertices / 1,260 triangular faces**.
- Runtime: the preview copies the OBJ to `models/v73/lotus-flower.obj`; `v732-lotus.js` loads it with the local OBJLoader, applies pink petal layers plus a gold center and supplies it to the existing lily-pad pickup.
- V7.5.1 loads the same project-owned OBJ directly through the single-runtime asset manager before gameplay begins.
- The Quaternius `Flowers.glb` asset remains bundled only as a lightweight fallback if the project-owned lotus cannot load.

## Quaternius Nile environment models

Quaternius assets are CC0. The preview build pins the showcase mirror to commit `d6aacfb25dd969ead90cddd94ad901e74aede5d8` and bundles the files same-origin with the Cloudflare preview.

Used models:

- `public/glb/nature_pack/Rock_1.glb`
- `public/glb/nature_pack/Plant_1.glb`
- `public/glb/nature_pack/Plant_2.glb`
- `public/glb/nature_pack/Bush_1.glb`
- `public/glb/nature_pack/Grass.glb`
- `public/glb/nature_pack/PalmTree_4.glb`
- `public/glb/nature_pack/Flowers.glb` — fallback flower only; V7.3.2 uses the project-owned lotus OBJ as the primary pickup model
- `public/glb/survival_pack/WoodLog.glb`
- `public/glb/cute_fish_pack/Boat.glb` — wooden boat replacing the previous raft/inflatable-looking prop

V7.5.1 extracts the gameplay and bank-decoration subset from the repository-owned `downloads/moses-nile-v737-full.zip` package into `models/environment/` during the Worker build. The package is pinned by commit and SHA-256, and the resulting files are served same-origin so iOS/WebView clients never depend on a cross-origin runtime model fetch. Rock and wood-log gameplay obstacles are cloned from these GLB files instead of generated polyhedrons.

## Relief textures

V7.5.1 restores the packaged water, damp-sand, sand and pebble normal maps from the same verified archive. The active scene uses two independently scrolling Nile normal layers and applies matching normal maps to the shoreline ribbons. The 1K terrain sources are resized to 512 px for the mobile build while preserving the normal-map channels.

## River-bank people

- Base model: **Quaternius Ultimate Modular Men / Farmer** (`public/glb/modular_men/Farmer.glb`).
- Pinned source revision: `d6aacfb25dd969ead90cddd94ad901e74aede5d8`.
- License: **CC0 1.0**.
- V7.3.1 uses the upright low-poly character as the body and adds lightweight project-owned linen-like tunics/robes, belts and optional collars at runtime. Clothing is stylised ancient-Egypt-inspired game art rather than an archaeological reconstruction.
- Characters are placed on both banks and periodically wave one arm. If a compatible arm bone exists it is animated directly; otherwise V7.3.1 adds a lightweight articulated fallback arm so waving is always visible. Timing is randomized per character.
- **V7.5.1 не грузит этот GLB.** Сборка превью его не распаковывает (нужен ещё и
  `SkeletonUtils` для клонирования скинов), поэтому фигуры на берегах строятся
  процедурно: цилиндрическая льняная накидка, голова и одна подвижная рука,
  которая машет проходящей корзинке. Скелетной анимации нет. Запись оставлена
  как история происхождения силуэта.

## Цветы на берегу

- Модель: **Flowers** из Quaternius Nature Pack (`models/v73/Flowers.glb`, 26.5 КБ).
- Лицензия: **CC0 1.0**.
- Раскладывается инстансами у самой воды вместе с тростником.

## Рыбацкая лодка

- Модель: **Boat** из Quaternius Cute Fish Pack (`models/v73/Boat.glb`, 13.7 КБ).
- Лицензия: **CC0 1.0**.
- Раннер V7.5.1 использует её как препятствие «лодка» на реке. Если пакет
  моделей недоступен, вместо неё строится процедурный корпус с парусом.

## Растительность берега через InstancedMesh

V7.5.1 больше не расставляет по берегам процедурные цилиндры и конусы. Геометрия
берётся из уже лицензированных моделей Quaternius (`Plant_2`, `Plant_1`, `Grass`,
`Bush_1`, `Rock_1`, `PalmTree_4`), нормализуется по габаритам и раскладывается
через `THREE.InstancedMesh` — по одному вызову отрисовки на материал вместо
сотен объектов. Новых внешних ассетов это не добавляет: используются те же
файлы из проверенного архива. Материалы клонируются, слегка приглушаются по
насыщенности под закатную палитру эталонного фона и получают вершинный шейдер
ветра из `js/shaders.js`.

Если пакет моделей не приехал (например, при локальном открытии без сборки),
каждый слой падает на процедурную заглушку той же формы, поэтому берег никогда
не остаётся пустым.

## Люди на берегу — настоящая модель

- Модель: **Quaternius Ultimate Modular Men / Farmer** (`models/v73/human.glb`,
  699 КБ, 5 476 треугольников, 49 костей). Лицензия **CC0 1.0**.
- Файл всё время лежал в проверенном архиве, но сборка его не забирала. Теперь
  забирает — вместе с `SkeletonUtils` из того же релиза three.js r128.
- Клонируется через `SkeletonUtils.clone`: обычный `clone()` делит скелет между
  копиями, и все фигуры двигались бы одинаково.
- Фигура приходит дюжиной скинованных кусков — это дюжина вызовов отрисовки на
  человека. `_mergeSkinned` сливает их в два меша (кожа и ткань) поверх общего
  скелета, так что фигура стоит два вызова.
- Роли и поведение: машущий рукой, рыбак с удочкой (изредка подсекает),
  носильщик с кувшином (шагает вдоль берега), прачка (наклоняется к воде).
  Кости ищутся по именам один раз при сборке, дальше в кадре только повороты.

## Движение мира

Берега раньше стояли на месте, и казалось, что корзинка не плывёт, а предметы
сами едут к ней. Теперь мир идёт навстречу:

- Русло выпрямлено. Пока берег извивался по z, растительность нельзя было гнать
  конвейером: сдвинутый куст переставал совпадать с линией песка. Извив давал
  около 5% полуширины и почти не читался.
- Каждый слой растительности раскладывается двумя копиями тайла длиной
  `SCROLL_TILE` (250 м) и двигается целиком — прокрутка сотен растений стоит
  одного изменения `position.z`.
- Ленты песка статичны, движение показывает бегущая текстура; люди и факелы
  едут вместе с тайлом и переставляются в его начало.
- Мимо камеры летит взвесь, камера слегка «дышит» на скорости.

## Небо вместо фотографии

До этой версии фоном служил кадр `assets/nile-reference-bg-v75.webp`, а вода и
берега рисовались полупрозрачными поверх него. Теперь фотографии в игре нет:

- **Купол неба** (`createSkyMaterial`) — вертикальный градиент «зенит — дымка —
  горизонт», придушенное солнце и два слоя ползущей пыли. Купол едет вместе с
  камерой, поэтому кадр закрыт всегда.
- **Полотнища пыли** (`createDustSheetMaterial`) — четыре вертикальные плоскости
  на разной глубине с бегущим шумом. Дают параллакс хамсина.
- **Пирамиды и дюны** — силуэты без тумана: цвет берётся от дымки и затемняется,
  верх пирамиды растворяется через вершинный градиент. Через туман они просто
  сливались бы с небом.
- Вода и берега стали непрозрачными: подложки под ними больше нет.

Тот же градиент продублирован в CSS (`--sky-zenith`, `--sky-haze`,
`--sky-horizon`) — он держит кадр, пока поднимается WebGL, и служит фоном
запасного 2D-режима, который дорисовывает пирамиды, дюны и полосы пыли сам.

## Усилители

Все четыре — собственные процедурные модели, а не иконки:

| Усилитель | Предмет | Материалы |
|---|---|---|
| Щит веры | скарабей с надкрыльями | лазурит, золото, бирюза |
| Свет Мириам | систр с дисками | золото, бирюза |
| Дыхание ветра | крылья Исиды | золото, бирюза, сердолик |
| Милость | анкх | золото, сердолик |

## Крокодил в движении

Модель Beerus не риггована, поэтому анимация идёт в вершинном шейдере
(`applyCrocodileSwim`): волна бежит вдоль самой длинной оси геометрии, хвост
виляет сильнее головы, а `uBite` приоткрывает пасть при броске. Направления
задаются масками осей, поэтому привязки к конкретной ориентации файла нет.

Игровая механика: крокодил идёт навстречу корзинке носом к камере и почти до
самого конца остаётся под водой — издали его выдаёт только расходящаяся рябь.
За сорок метров показывается спина, за двадцать он всплывает целиком и начинает
хлопать пастью. На средней сложности подкрадывается к дорожке игрока и
прекращает манёвр за шестнадцать метров.

Бегемот всплывает так же и разевает пасть, но остаётся процедурным: подходящей
модели в проверенном архиве нет.

## Шейдеры V7.5.1

Все шейдеры проекта — собственные, лежат в `web/games/moses-nile-v7/js/shaders.js`:

- **Поверхность Нила** — сумма четырёх направленных волн в вершинном шейдере,
  две независимо ползущие карты нормалей из пакета текстур (с процедурным
  запасным вариантом), Френель, солнечный блик и мерцание, каустика на
  мелководье, пена у берега, на гребнях и вокруг корзинки.
- **Плёнка бликов** — второй слой воды с бегущими светлыми полосами.
- **Кромка прибоя** — узкая лента вдоль каждого берега с бегущей пеной.
- **Небо песчаной бури** — купол вокруг камеры: градиент, солнце сквозь взвесь,
  два слоя пыли и звёзды для ночного биома.
- **Полотнища пыли** — вертикальные плоскости с бегущим шумом на разной глубине.
- **Плавание крокодила** — волна по телу и раскрытие пасти в вершинном шейдере.
- **Столбы света**, **купол «Щита веры»**, **ореолы бонусов**, **след корзинки**,
  **кольца ряби** и **материал частиц** — отдельные небольшие программы.
- **Ветер** — инъекция в вершинный шейдер `MeshStandardMaterial` через
  `onBeforeCompile`; работает и для InstancedMesh, фаза берётся из мировой
  позиции экземпляра, поэтому растения качаются вразнобой.

## Project-owned environment graphics

The V7.3 river banks are generated as sloped, irregular Three.js `BufferGeometry` meshes rather than flat planes. The game applies a project-owned procedural sand texture, darker wet shoreline strips and green riparian strips. Existing Quaternius rocks, grasses, bushes, plants and palms dress the bank geometry.

The animated Nile surface, contact effects, stepped Giza-inspired background pyramids, UI and gameplay logic remain project-owned procedural/runtime graphics.

Препятствия «нависший папирус» (`V751PapyrusGate`), «водоворот» (`V751Whirlpool`)
и «бегемот» (`V751NileHippo`), а также люди и факелы на берегах — собственная
процедурная геометрия проекта. Она собирается в один меш на материал
(`mergeByMaterial`), чтобы каждое препятствие стоило один-два вызова отрисовки.

## Процедурный PBR и освещение небом

`web/games/moses-nile-v7/js/materials.js` — собственная библиотека проекта без
внешних зависимостей и без своего кадрового цикла.

**Зачем.** Модели Quaternius приезжают вообще без UV-развёртки и с плоской
заливкой: положить на них текстуру было нельзя, и берег вместе с препятствиями
читался как пластмасса. Освещения окружением тоже не было —
`MeshStandardMaterial` без карты отражает пустоту.

**Что делает.**

- **Поверхности.** Карты цвета, нормалей и шероховатости рисуются на канвасе
  нативными операциями (быстро даже на телефоне), нормали выводятся оператором
  Собеля по яркости, затенение впадин домножается прямо в цвет — второй набор
  UV для `aoMap` не нужен. Набор: песчаник, известняк, гранит, кора, мокрая
  шкура, чешуя, лён, плетение корзины, листва.
- **Развёртка.** `applyBoxUV` считает проекцию по доминирующей оси нормали, так
  что карты ложатся на любую геометрию без UV.
- **Свет неба.** Небо задано формулой; из неё берутся обе половины освещения:
  рассеянная — через сферические гармоники `THREE.LightProbe`, зеркальная —
  тем же градиентом по отражённому лучу с френелевским краем
  (`addSkyReflection`, инъекция в шейдер через `onBeforeCompile`).
  От карты окружения пришлось отказаться: `PMREMGenerator` в r128 пишет в
  RGBE-цель, незакрытые тексели остаются с альфой 255 (это экспонента 2^127),
  и после размытия сцена белеет целиком; обычная кубическая текстура в этой
  ревизии стандартным материалом игнорируется.
- **Растворение к горизонту** (`addHorizonFade`) и мягкие контактные тени.

Все правки шейдеров складываются через `chainOnBeforeCompile`, поэтому ветер из
`shaders.js` и отражения неба уживаются на одном материале.

## Пирамиды и бегемот

Пирамиды больше не плоские самосветящиеся конусы: `stepPyramidGeometry` строит
ступенчатую кладку (вертикальная стена и горизонтальная приступка на каждый
ряд), сверху лежат остатки полированной известняковой облицовки, как у пирамиды
Хафра, а у подножия — осыпь. Материал песчаниковый, PBR, закатная раскраска
сохранена в вершинных цветах и домножается на текстуру.

Бегемот (`V751NileHippo`) собран заново: туша и череп — одна непрерывная
оболочка вращения по хребту, нижняя челюсть на собственном шарнире, нёбо,
клыки, уши и глаза-перископы. Он встречает корзинку мордой и раскрывает пасть
при сближении.

## Правки по замечаниям владельца игры

- **Тёмный овал под моделями.** Контактное пятно было ровным тёмным кругом
  поверх воды: объекты выглядели парящими, а сквозь него просвечивали
  подводные крокодилы. Теперь тень живёт в альфе мягкого градиента. Умножение
  (`MultiplyBlending`) здесь не годится: холст игры прозрачный и лежит поверх
  страницы, поэтому `blendFunc(ZERO, SRC_COLOR)` выедает альфу кадра — вместо
  тени появлялся светлый прямоугольник.
- **Жёлтый крокодил.** Процедурные карты перекрывали его собственную
  запечённую текстуру чешуи. `NileMaterials.dress` больше не трогает `map`,
  цвет и шероховатость у моделей со своей текстурой — им достаются только
  рельеф и шероховатость, если тех не было. Сам крокодил стал крупнее и
  при всплытии один раз широко распахивает и с силой захлопывает пасть.
- **Люди с берегов удалены** вместе со скелетной моделью `human.glb`,
  `SkeletonUtils` и всем кодом их анимации.
- **Пирамиды** отнесены за горизонтальные дюны, их основания заносит песчаный
  вал, а перед ними идёт медленное полотнище бури. Материал у них намеренно
  несветящийся: освещённый камень на таком удалении выводится ровно в яркость
  дымки и силуэт пропадает. Важная тонкость порядка вывода: `renderOrder`
  у группы задаёт `groupOrder`, который сравнивается раньше `renderOrder`
  отдельных мешей, поэтому непрозрачные пирамиды рисовались до купола неба и
  небо закрашивало их целиком — материал сделан прозрачным, чтобы они
  выводились в прозрачном проходе после купола.
- **Берег** перестал быть плоской лентой в две вершины: сечение разбито на
  6–9 полос, поперёк лежат барханы (`duneHeight`), растительность садится на
  этот рельеф и стала заметно гуще.
- **Свет** переведён к естественному: зенит неба голубой, а не песочный,
  заполняющий свет вдвое слабее (его половину теперь даёт световой зонд неба),
  солнце сильнее. Раньше все источники были одного бежевого тона и одинаковой
  силы, и сцена превращалась в ровную песчаную заливку без теней и объёма.
