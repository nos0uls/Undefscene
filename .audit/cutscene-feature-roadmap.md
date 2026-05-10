# Cutscene Feature Roadmap Audit

Документ фиксирует идеи улучшений системы катсцен и визуального редактора Undefscene для последующей реализации и обсуждения.

## Контекст

Этот план основан на сравнении Undefscene с Delta-code cutscene maker и текущей реализацией Undefscene visual editor.

Цель документа:

- сохранить полезные идеи для будущей реализации;
- отделить обязательные задачи от спорных;
- описать назначение, параметры и use cases для каждой потенциальной фичи;
- не добавлять в roadmap решения, которые уже закрыты текущей архитектурой.

---

## 1. Диалоговые микрокоманды

### Идея

Добавить более точное управление отдельными репликами/линиями диалога, не только запуск всего Yarn/Dialogue-блока.

### Возможные команды / ноды

#### `Dialogue Control`

Управляет поведением активного диалогового окна.

**Параметры:**

- `speaker` — текущий говорящий.
- `portrait` — портрет/face sprite для текущей или следующей строки.
- `side` — сторона окна: `auto`, `top`, `bottom`, `left`, `right`.
- `prevent_skip` — запретить пропуск строки.
- `stay` — оставить окно открытым после строки.
- `box_style` — стиль окна, если система UI это поддерживает.

**Use cases:**

- синхронизировать эмоцию персонажа с конкретной строкой;
- поставить портрет до следующей реплики;
- запретить скип важной строки;
- заставить окно остаться на экране, пока идут анимации.

#### `Wait Dialogue Line`

Ожидает конкретную строку или момент в диалоге.

**Параметры:**

- `dialogue_id` — активный диалог или `current`.
- `line_id` / `line_index` — строка, которую ждём.
- `phase` — `start`, `shown`, `end`.
- `timeout_seconds` — безопасный таймаут.
- `on_timeout` — `continue`, `fail`, `warn`.

**Use cases:**

- персонаж делает жест ровно на определённой реплике;
- камера панорамирует после окончания конкретной строки;
- звук проигрывается в середине диалога.

### Приоритет

Средний. Полезно для cinematic-сцен, но зависит от возможностей Chatterbox/Yarn-интеграции.

---

## 2. Delay-команды / Scheduled Actions

### Идея

Добавить отложенное выполнение действия без обязательной блокировки основной очереди.

Сейчас часть такого поведения можно собрать через `Parallel + Wait`, но отдельная нода будет проще для мелких реакций.

### Возможная команда / нода

#### `Schedule Action`

Запускает вложенное действие через задержку.

**Параметры:**

- `delay_seconds` — задержка перед стартом.
- `action` — вложенное действие или ссылка на mini-sequence.
- `blocking` — ждать ли завершения запланированного действия.
- `cancel_on_cutscene_end` — отменить, если катсцена закончилась.
- `tag` — опциональная метка для отмены/отладки.

**Use cases:**

- проиграть звук через 0.2 секунды после шага;
- показать эмоцию чуть позже реплики;
- запустить фоновую анимацию без усложнения graph;
- создать серию delayed micro-events.

### Приоритет

Средний. Удобство высокое, но нужно аккуратно определить cleanup, чтобы scheduled actions не жили после завершения катсцены.

---

## 3. Сохранение / откат состояния катсцены

### Идея

Добавить snapshot/rollback для состояния сцены. Это похоже на Delta-code `saveload`, но должно быть безопаснее и явно ограничено.

### Возможные команды / ноды

#### `Checkpoint State`

Создаёт снимок состояния.

**Параметры:**

- `checkpoint_id` — имя снимка.
- `include_actors` — сохранять актёров.
- `include_player` — сохранять игрока.
- `include_camera` — сохранять камеру.
- `include_music` — сохранять музыку.
- `include_globals` — список глобальных переменных или флагов.
- `include_instances` — список target refs.

**Use cases:**

- откат сцены после неудачного интерактивного выбора;
- безопасный preview сложной катсцены;
- retry-сцены;
- отладка развилок.

#### `Restore State`

Восстанавливает ранее созданный checkpoint.

**Параметры:**

- `checkpoint_id` — какой снимок восстановить.
- `cleanup_transients` — удалить временные объекты катсцены.
- `restore_camera` — вернуть камеру.
- `restore_music` — вернуть музыку.
- `on_missing` — `warn`, `ignore`, `fail`.

**Use cases:**

- откатить актёров и камеру после failed branch;
- вернуть состояние перед повторным проигрыванием;
- отменить visual/runtime preview без перезапуска комнаты.

### Приоритет

Средний/низкий. Мощно, но может быть сложно и опасно. Нужны строгие ограничения, чтобы не сохранять “весь мир” бесконтрольно.

---

## 4. Relative Positioning

### Идея

Добавить first-class команды для относительных координат. Это нужно часто: встать рядом с NPC, подойти к двери, поставить камеру с offset, сдвинуть объект от текущего положения.

### Возможные команды / ноды

#### `Move To Target Offset`

Двигает актёра к позиции другого объекта с offset.

**Параметры:**

- `target` — кто двигается.
- `reference` — относительно кого двигаться.
- `offset_x` / `offset_y` — смещение.
- `speed_px_sec` или `duration_seconds`.
- `collision` — учитывать коллизии.
- `stop_distance` — остановиться на расстоянии.

**Use cases:**

- игрок подходит к NPC на 32 px слева;
- персонаж встаёт рядом с дверью;
- party member занимает позицию за игроком.

#### `Set Position Relative`

Мгновенно ставит объект относительно другого объекта.

**Параметры:**

- `target`.
- `reference`.
- `offset_x` / `offset_y`.
- `copy_facing` — скопировать направление reference.
- `copy_depth` — скопировать depth или depth + offset.

**Use cases:**

- спавн эффекта над головой;
- поставить актёра рядом с маркером;
- подготовить сцену относительно dynamic object.

#### `Add Position`

Сдвигает объект относительно текущей позиции.

**Параметры:**

- `target`.
- `dx` / `dy`.
- `mode` — `instant`, `move`, `tween`.
- `duration_seconds`.

**Use cases:**

- маленький шаг назад;
- толчок;
- ручная поправка позиции без абсолютных координат.

### Приоритет

Высокий. Это простая и очень полезная группа команд.

---

## 5. Stick / Attachment

### Идея

Добавить возможность временно прикрепить один объект к другому.

### Возможные команды / ноды

#### `Attach To Target`

Прикрепляет объект к target с offset.

**Параметры:**

- `target` — что прикрепляем.
- `parent` — к чему прикрепляем.
- `offset_x` / `offset_y`.
- `follow_facing` — учитывать направление parent.
- `follow_scale` — учитывать scale parent.
- `follow_depth` — обновлять depth относительно parent.
- `duration_seconds` — 0 = пока не будет detach.
- `detach_on_cutscene_end` — снять attachment при завершении.

**Use cases:**

- эффект над головой следует за актёром;
- prop “держится” в руке персонажа;
- маркер/иконка привязана к NPC;
- камера или helper object следует за target.

#### `Detach`

Снимает attachment.

**Параметры:**

- `target`.
- `keep_world_position` — оставить объект там, где он был.
- `destroy_after_detach` — удалить после detach.

### Приоритет

Средний/высокий. Даёт новый слой выразительности для props и эффектов.

---

## 6. Auto Depth

### Текущий статус

Предположительно у игрока и большинства объектов уже используется логика `depth = -y`.

### Вывод

Отдельная нода `Auto Depth` может быть не нужна, если это уже глобальный стандарт проекта.

### Что всё же стоит проверить

- все ли actor-like объекты реально используют `depth = -y`;
- не ломает ли катсцена depth через `Set Depth`;
- есть ли случаи, где depth нужно временно “заморозить”;
- есть ли `depth_offset` / `depth_bonus` для визуальных слоёв.

### Возможная команда, если понадобится

#### `Depth Mode`

**Параметры:**

- `target`.
- `mode` — `auto_y`, `manual`, `locked`.
- `offset`.

**Use cases:**

- временно поднять объект над всеми;
- отключить auto-depth на спец-анимации;
- вернуть объект в стандартный режим.

### Приоритет

Низкий. TODO: проверить текущую реализацию depth у `player`, `obj_actor` и NPC перед принятием решения.

---

## 7. Directional / Object Shake Variants

### Идея

Расширить shake-команды, чтобы ими можно было управлять точнее.

### Возможные команды / ноды

#### `Shake Object Advanced`

**Параметры:**

- `target`.
- `duration_seconds`.
- `magnitude_x`.
- `magnitude_y`.
- `frequency`.
- `mode` — `random`, `sine`, `directional`, `decay`.
- `direction_degrees` — для directional shake.
- `decay` — сила затухания.
- `blocking` — ждать завершения.

**Use cases:**

- объект дрожит только по X;
- персонажа трясёт вверх-вниз от страха;
- удар отбрасывает shake в конкретном направлении;
- shake плавно затухает.

#### `Camera Shake Advanced`

Аналогично, но для камеры.

**Параметры:**

- `duration_seconds`.
- `magnitude_x` / `magnitude_y`.
- `frequency`.
- `mode`.
- `decay`.

### Приоритет

Средний. Полезно для качества постановки и “сочности” сцен.

---

## 8. Music Control

### Идея

Сейчас явно виден `Play SFX`, но катсценам нужен first-class контроль музыки, а не только вызовы через `Run Function`.

### Возможные команды / ноды

#### `Play Music`

**Параметры:**

- `track` — music asset/name.
- `loop`.
- `volume`.
- `fade_in_seconds`.
- `restart_if_same`.

**Use cases:**

- начать тему катсцены;
- плавно ввести ambient;
- сменить музыку перед reveal.

#### `Stop Music`

**Параметры:**

- `fade_out_seconds`.
- `target` — current/all/specific track.

**Use cases:**

- резкая тишина перед важной фразой;
- fadeout перед переходом комнаты.

#### `Set Music Parameter`

**Параметры:**

- `track` или `current`.
- `volume`.
- `pitch`.
- `fade_seconds`.

**Use cases:**

- приглушить музыку под диалог;
- замедлить/исказить трек для эффекта;
- плавно вернуть громкость.

#### `Restore Previous Music`

**Параметры:**

- `fade_seconds`.
- `resume_position`.

**Use cases:**

- временная cutscene music возвращается к room music;
- после flashback вернуть предыдущий ambient.

### Приоритет

Высокий. Музыка — базовый слой катсцен.

---

## 9. Special Sprite Slots / Pose Presets

### Текущий статус

В visual editor уже есть выбор спрайта, поэтому прямой аналог Delta-code `specialsprite[index]` может быть не нужен.

### Что может быть полезно вместо этого

#### `Actor Pose Presets`

Не команда движка, а UX-слой редактора.

**Параметры/данные:**

- `actor_key`.
- `pose_name`.
- `sprite`.
- `image_index`.
- `image_speed`.
- `default_facing`.

**Use cases:**

- быстро выбрать `kris_shocked`, `susie_point`, `noelle_sit`;
- не искать вручную сотни sprite assets;
- стандартизировать позы между сценами.

### Приоритет

Средний. Не обязательно как runtime-команда, но полезно как editor feature.

---

## 10. Wait Custom / Wait If Object Property

### Текущий статус

Часть этой задачи уже закрывается branch/edge condition. Но branch — это больше про развилку или guarded transition, а не про читаемое “жди, пока условие станет true”.

### Вывод

Отдельная нода всё же может быть полезна, если сделать её безопасной и понятной.

### Возможная команда / нода

#### `Wait Until`

**Параметры:**

- `kind` — `global`, `actor`, `instance`, `camera`.
- `target` — если нужен actor/instance.
- `property` — имя свойства.
- `operator` — `==`, `!=`, `>`, `<`, `>=`, `<=`, `exists`, `not_exists`.
- `value` — ожидаемое значение.
- `timeout_seconds`.
- `on_timeout` — `continue`, `warn`, `fail`, `branch_false`.
- `poll_interval_frames` — как часто проверять.

**Use cases:**

- ждать завершения внешнего эффекта;
- ждать, пока объект достигнет состояния;
- ждать глобальный флаг без создания branch-развилки;
- сделать graph читаемее: “Wait Until door.opened == true”.

### Приоритет

Средний. Не критично, но улучшает читаемость и снижает злоупотребление branch.

---

## 11. Fine Animation Controls

### Текущий статус

Частично уже есть: `Animate`, `Set Property`, возможно `Tween`, `Flip`, `Spin`.

### Что стоит добавить/уточнить

#### `Set Animation Frame`

**Параметры:**

- `target`.
- `image_index`.
- `image_speed`.
- `pause` — поставить скорость в 0 после установки.

**Use cases:**

- зафиксировать персонажа на конкретном кадре;
- синхронизировать кадр с репликой;
- сделать “pose hold”.

#### `Play Animation Until`

**Параметры:**

- `target`.
- `sprite`.
- `image_speed`.
- `until` — `animation_end`, `frame`, `seconds`.
- `final_frame`.
- `loop`.

**Use cases:**

- проиграть одноразовую анимацию и продолжить;
- ждать конкретный кадр удара;
- сделать attack/reaction timing.

#### `Animation Override Mode`

**Параметры:**

- `target`.
- `enabled`.
- `restore_auto_animation_on_end`.

**Use cases:**

- временно отключить auto-walk/auto-face;
- не дать player logic сбросить sprite во время scripted animation.

### Приоритет

Средний. Нужно сначала проверить, что уже покрыто текущими runtime actions.

---

## 12. Проверка игрока как актёра

### Идея

Не добавлять player proxy без необходимости, но проверить, что текущая модель “игрок = актёр/target” действительно стабильна.

### Что проверить

- `player` корректно резолвится через `target_ref`.
- `Move` / `Follow Path` не конфликтуют с player input.
- `can_move = false` реально блокирует ввод.
- camera override не борется с player camera follow.
- `Animate` не сбрасывается player step-логикой.
- `Set Facing` не перетирается auto-facing.
- collision mode работает ожидаемо для player.
- после катсцены управление возвращается без рассинхрона.

### Возможные тестовые сцены

- player идёт по path, затем управление возвращается;
- player анимируется на месте, затем снова idle/walk;
- камера следует за player во время scripted move;
- partial control включается и выключается;
- dialogue + player animation одновременно.

### Решение по proxy

Отдельный `Proxy Player Start/Commit` пока не добавлять.

TODO: вернуться к player proxy только если реальные тесты покажут, что прямое управление `player` небезопасно.

### Приоритет

Высокий как проверка, низкий как новая фича.

---

## 13. Правки и слабые места Visual Editor

### Важно

Step Recorder пока не включается в план реализации. Пользователь отдельно подумает над этой идеей.

### 13.1 Разбить `RoomVisualEditorModal.tsx`

Файл слишком большой и совмещает много ответственностей.

**Предлагаемые модули:**

- `RoomVisualEditorStage.tsx` — viewport/canvas/pointer surface.
- `RoomVisualEditorToolbar.tsx` — room, refresh, zoom, fit.
- `RoomVisualEditorPathTools.tsx` — pencil/eraser/import path.
- `RoomVisualEditorActorTools.tsx` — actor picker, placement, import actors.
- `useRoomVisualPathEditing.ts` — path state, history, pencil/eraser.
- `useRoomVisualActorEditing.ts` — actor draft/drag/import.
- `useRoomScreenshotBundle.ts` — loading/stitch/cache.

**Use cases:**

- проще добавлять новые tools;
- меньше риск сломать pointer logic;
- проще тестировать path и actor editing отдельно.

### 13.2 Использовать скорость выбранной `follow_path` для preview

Сейчас play preview в modal использует фиксированную скорость.

**Параметры:**

- брать `speed_px_sec` из selected node;
- fallback оставить текущий дефолт;
- показывать скорость в UI.

**Use cases:**

- preview ближе к runtime;
- меньше сюрпризов после import.

### 13.3 Улучшить actor import для virtual player/target

Сейчас virtual actors полезны для preview, но не импортируются обратно.

**Возможный подход:**

- для `player` разрешить импорт как `Set Position` node или update выбранной ноды;
- для unknown virtual target предложить создать `actor_create`;
- показывать предупреждение перед созданием новых нод.

**Use cases:**

- быстро поставить player/start target на room screenshot;
- создать actor_create из visual editor.

### 13.4 Добавить генерацию движения из actor placement diff

Без Step Recorder, но в простом варианте.

**Идея:**

- если выбран actor marker и path нарисован, кнопка `Create Move/Follow Path for Actor` создаёт ноду с target выбранного actor.

**Параметры:**

- `target`.
- `points`.
- `speed_px_sec`.
- `collision`.
- `connect_after_selected_node`.

**Use cases:**

- меньше ручного ввода target после импорта path;
- быстрее связывать visual path с конкретным актёром.

### 13.5 Улучшить room/object context

Сейчас visual editor работает по screenshot tiles. Это хорошо, но он не знает семантику объектов комнаты.

**Возможные улучшения:**

- overlay interactables/solids/markers из room data;
- показать object names при hover;
- snap к marker objects;
- warning, если path проходит через known solid.

**Use cases:**

- меньше ошибок координат;
- проще ставить персонажей у дверей/маркеров;
- визуальный редактор становится ближе к in-game authoring.

### Приоритет

Высокий для рефакторинга файла и скорости preview. Средний для context overlays.

---

## 14. Новые идеи функционала, которых не было в сравниваемых движках

### 14.1 Cinematic Beats

#### Идея

Добавить named beat markers — смысловые моменты сцены, к которым можно привязывать действия.

**Возможная нода:** `Beat`

**Параметры:**

- `beat_name`.
- `description`.
- `color`.
- `tags`.

**Use cases:**

- “reveal”, “joke hit”, “door slam”, “camera focus”;
- легче читать большие графы;
- можно искать/навигацировать по важным моментам.

---

### 14.2 Rehearsal / Dry Run Mode

#### Идея

Режим проигрывания катсцены без permanent side effects.

**Параметры:**

- `disable_global_writes`.
- `disable_room_transition`.
- `mock_dialogue`.
- `auto_restore_state`.

**Use cases:**

- безопасный preview в редакторе;
- QA без поломки сейва;
- проверка timing без запуска всей игры заново.

---

### 14.3 Director Notes

#### Идея

Ноды-комментарии для режиссуры, не экспортируемые в runtime.

**Параметры:**

- `note_text`.
- `category` — `acting`, `camera`, `sound`, `todo`, `warning`.
- `pinned`.

**Use cases:**

- оставить указание “тут нужна другая эмоция”;
- помечать незаконченные участки;
- передавать сцену другому разработчику.

TODO: использовать явные TODO-заметки для незавершённых сцен.

---

### 14.4 Camera Composition Guides

#### Идея

В visual editor показывать направляющие композиции кадра.

**Параметры:**

- `guide_type` — `rule_of_thirds`, `center`, `safe_area`, `dialogue_safe_area`.
- `camera_size`.
- `target_aspect_ratio`.

**Use cases:**

- кадрировать персонажей красиво;
- не закрывать лица диалоговым окном;
- планировать cinematic shots прямо в room visual editor.

---

### 14.5 Action Templates / Macros

#### Идея

Переиспользуемые мини-сценарии.

**Примеры templates:**

- `Character Enters From Left`.
- `Dialogue Reaction Shot`.
- `Camera Push-In Reveal`.
- `NPC Walks Away And Despawns`.

**Параметры:**

- `template_name`.
- `targets`.
- `duration_scale`.
- `position_reference`.

**Use cases:**

- быстрее собирать типовые сцены;
- единый стиль постановки;
- меньше копипасты graph nodes.

---

### 14.6 Timing Lanes

#### Идея

Визуальный слой, который показывает длительности действий по actor/camera/audio lanes.

**Параметры:**

- lane type: `actor`, `camera`, `audio`, `dialogue`.
- action duration.
- blocking/non-blocking state.

**Use cases:**

- видеть, где камера закончится раньше движения;
- находить лишние паузы;
- балансировать параллельные действия.

---

### 14.7 Shot Presets

#### Идея

Набор пресетов камеры для быстрой постановки.

**Примеры:**

- `close_up(target)`.
- `two_shot(target_a, target_b)`.
- `establishing(room_area)`.
- `over_the_shoulder(target, reference)`.

**Параметры:**

- `targets`.
- `padding`.
- `duration_seconds`.
- `easing`.
- `dialogue_safe_area`.

**Use cases:**

- быстро делать кинематографичные камеры;
- стандартизировать visual language;
- меньше ручной настройки camera pan/track.

---

### 14.8 Continuity Checker

#### Идея

Проверка логической связности сцены перед export.

**Проверки:**

- actor используется до `actor_create`;
- actor уничтожен, но позже снова используется;
- музыка не восстановлена;
- player control не возвращён;
- camera override не сброшен;
- path пустой или слишком короткий;
- wait без timeout на потенциально внешнем условии.

**Use cases:**

- меньше runtime-зависаний;
- безопаснее сложные сцены;
- лучше validation перед export.

---

### 14.9 Emotional State Layer

#### Идея

Высокоуровневое состояние эмоции актёра, которое может автоматически выбирать idle pose, portrait, emote и voice style.

**Возможная команда:** `Set Emotion`

**Параметры:**

- `target`.
- `emotion` — `neutral`, `angry`, `sad`, `scared`, `happy`, `confused`.
- `intensity`.
- `apply_to_portrait`.
- `apply_to_sprite`.
- `apply_to_emote`.
- `duration_seconds`.

**Use cases:**

- одной командой подготовить персонажа к серии реплик;
- consistent portrait/sprite choice;
- меньше ручной настройки каждой эмоции.

---

### 14.10 Cutscene Lint Profiles

#### Идея

Разные уровни строгости validation.

**Профили:**

- `prototype` — минимум ошибок.
- `production` — строгая проверка cleanup.
- `cinematic` — проверка timing/camera/dialogue.
- `interactive` — проверка partial control/wait conditions.

**Use cases:**

- не мешать прототипированию;
- жёстко проверять готовые сцены;
- адаптировать warnings под тип сцены.

---

## Предлагаемый порядок реализации

### Ближайшие кандидаты

1. `Relative Positioning`.
2. `Music Control`.
3. `Wait Until`.
4. `Visual Editor` refactor / preview speed from selected node.
5. Проверка `player` как actor target.

### Среднесрочно

1. `Attach To Target`.
2. `Shake Advanced`.
3. `Dialogue Control`.
4. `Fine Animation Controls`.
5. `Action Templates / Macros`.

### Позже / исследовать

1. `Checkpoint / Restore State`.
2. `Cinematic Beats`.
3. `Timing Lanes`.
4. `Continuity Checker`.
5. `Emotional State Layer`.

## Открытые вопросы

- TODO: проверить, насколько текущая player логика безопасна как прямой cutscene target.
- TODO: проверить depth-логику у player/NPC/actor перед добавлением `Depth Mode`.
- TODO: решить, нужна ли отдельная `Wait Until`, если edge conditions будут расширены.
- TODO: проверить, какие fine animation controls уже есть в runtime, чтобы не дублировать команды.
- TODO: решить позже, нужен ли Step Recorder; пока не включать в план реализации.
