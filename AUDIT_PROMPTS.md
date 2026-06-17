# Undefscene Editor — Промпты для аудита кода

> Документ содержит два готовых промпта для запуска через Devin-сабагенты (Подход A: фазированный, Подход B: feature-based), формат выходного артефакта и оценку областей, которые трогать не стоит.

---

## Общие параметры для обоих подходов

- **Целевая директория**: `D:\GitHub\Undefscene\editor-app\src`
- **Tech stack**: Electron 39 + React 19 + TypeScript 5.9 + electron-vite + @xyflow/react + framer-motion + lucide-react
- **i18n**: собственная реализация (`src/renderer/src/i18n/index.ts`), НЕ react-i18next
- **State**: Context API + hooks (нет Redux/Zustand/MobX)
- **IPC**: `ipcRenderer.invoke/handle` через `contextBridge` (`src/preload/index.ts`)
- **Tests**: vitest (`src/main/__tests__`, `src/renderer/src/editor/__tests__`)
- **Lint**: eslint + prettier
- **Node definitions**: `nodeRegistry.ts` (1958 строк) — центральный реестр всех нод. Содержит контрактные поля (`fields[].key`, `defaultParams`) и UI-поля (`label`, `placeholder`). См. раздел "Области: классификация риска" для tier-классификации.
- **Risk tiers**: Frozen (compileGraph, reverseCompile, validateGraph, runtimeTypes, nodeRegistry ключи, .yyp parser) → Audit-only (templateStorage, RoomVisualEditorCanvas stitch) → Open (CutsceneNodes UI, yarnPreview, usePathEditorLogic)

---

## Подход A: Фазированный аудит (рекомендуется)

Запускать строго последовательно. Каждая фаза получает контекст от предыдущей через summary-файл.

### Фаза 1 — Разведка архитектуры (1 сабагент)

```
Ты — архитектурный аналитик. Исследуй проект Undefscene по пути D:\GitHub\Undefscene\editor-app\src.

Задача: составить точную карту архитектуры.

Требования:
1. Перечисли все entry points: main process, preload, renderer (App.tsx), visual editor window.
2. Опиши data flow: от пользовательского действия → через IPC → в state → на canvas.
3. Найди все глобальные Context providers в renderer (React.createContext) и их иерархию.
4. Найди все custom hooks (use*.ts) и сгруппируй по ответственности: state, UI, logic, IO.
5. Перечисли все IPC channels (invoke/handle) с их назначением.
6. Определи, где живут business rules (валидация графа, компиляция, yarn preview).
7. Найди все места работы с файловой системой (fs/promises, dialog) — только в main или есть leaks?
8. Оцени test coverage: какие модули покрыты, какие нет.

Выход: структурированный markdown с путями к файлам. Никаких предположений — только конкретика из кода.
```

### Фаза 2 — Слои: IPC → Preload → Main (1-2 сабагента)

```
Ты — специалист по безопасности Electron. Исследуй IPC-слой проекта Undefscene.

Контекст: Проект использует electron-vite, contextBridge в preload, invoke/handle между main и renderer.

Задача: аудит IPC на уязвимости и best practices.

Требования:
1. Все ipcMain.handle в main/index.ts — есть ли валидация входных аргументов? Нет ли прямого выполнения путей из renderer?
2. В preload/index.ts — как expose-ятся API? Есть ли type-unsafe `any` в сигнатурах?
3. Есть ли использование shell.openPath / shell.openExternal? Валидируются ли аргументы перед передачей?
4. Есть ли в main процессе eval, new Function, innerHTML? (поиск по всем файлам main/)
5. IPC channels naming: единообразны ли? Есть ли риск коллизий имён?
6. Error handling в IPC: что происходит, если handle бросает исключение? Попадает ли stack trace в renderer?
7. Memory leaks в IPC: есть ли подписки ipcRenderer.on без removeListener (исключая updater API, где есть cleanup)?
8. Есть ли race conditions между layout.read/write и runtime.read/write?

Выход: таблица [File | Line | Issue | Severity | Fix recommendation].
```

### Фаза 3 — Слои: State + Data Flow (1-2 сабагента)

```
Ты — React-архитектор. Исследуй state management и data flow в Undefscene editor.

Контекст: Проект использует React Context API + custom hooks. Нет Redux/Zustand.

Задача: найти проблемы с состоянием, перерисовками и data consistency.

Требования:
1. Найди все React Context providers. Есть ли "provider hell" (глубокая вложенность)?
2. Для каждого use*.ts хука: определи, какие state changes он инициирует. Есть ли ненужные перерисовки?
3. Проверь useEffect зависимости во всех hooks: есть ли missing deps, избыточные deps, race conditions?
4. Есть ли useState/useReducer логика, которая должна быть в useRef (например, флаги инициализации)?
5. Проверь localStorage / sessionStorage / electron-store usage: atomic writes? JSON parse error handling?
6. Есть ли caching (useMemo, useCallback) где оно нужно? И наоборот — избыточное мемоизация?
7. Найди все setInterval/setTimeout/addEventListener в hooks. Есть ли cleanup в return useEffect?
8. Проверь flow: выбрал node → открыл inspector → изменил поле → обновился canvas. Нет ли пропущенных обновлений?

Выход: таблица [Hook/File | Problem | Impact | Fix].
```

### Фаза 4 — Слои: UI / React Components (2 сабагента)

```
Ты — React-разработчик. Исследуй UI-слой Undefscene editor.

Задача: найти React-антпаттерны, a11y проблемы, и hardcoded контент.

Требования:
1. ВСЕ JSX-файлы: есть ли hardcoded строки (кроме debug/test/классов CSS)? Найди конкретные строки вне i18n. Включая CutsceneNodes.tsx — проверь, какие ноды НЕ используют `t()` (SetPositionNode, SetPositionRelativeNode, ActorCreateNode и др.).
2. Есть ли hardcoded цвета (hex, rgb) в inline styles или className? Используются ли CSS variables / theme tokens?
3. Проверь z-index во всех компонентах: есть ли "z-index wars" (модалки под тултипами, dropdown за пределами окна)?
4. Правильно ли используются key props в списках (особенно в React Flow nodes, docking panels, modals)?
5. Есть ли memoizable компоненты без React.memo? Или React.memo на компонентах с часто меняющимися props?
6. Есть ли использование dangerouslySetInnerHTML? Если да — sanitize?
7. Проверь image loading: есть ли race conditions (компонент размонтирован, загрузка продолжается)?
8. Modal/Dialog компоненты: focus trap, Escape to close, portal rendering, scroll lock?
9. Проверь ToastHub: не перегружен ли DOM при большом количестве тостов?

Выход: таблица [Component | Issue | Line | Fix].
```

### Фаза 5 — Слои: Темы + i18n + Стили (1 сабагент)

```
Ты — UI-инженер. Исследуй темизацию и интернационализацию Undefscene.

Контекст: i18n — собственная реализация (createTranslator, translatePath). Темы — useTheme.ts.

Задача: проверить полноту покрытия.

Требования:
1. Сравни en.ts и ru.ts: одинаковые ли ключи? Есть ли orphaned keys (есть в одном, нет в другом)?
2. Все hardcoded строки в UI: найди и сопоставь с i18n. Сколько процентов не переведено? Проверь `nodeRegistry.ts` — поля `label` и `placeholder` нод (это UI-тексты, можно i18n-ить, но `fields[].key` — нет).
3. Темы: есть ли CSS variables для цветов? Используются ли они во всех компонентах?
4. Есть ли dark/light mode? Переключается ли системная тема корректно?
5. Проверь шрифты: загружаются ли fallback шрифты? Есть ли FOUT/FOIT проблемы?
6. Есть ли inline styles с px/rem конфликтами? Есть ли responsive breakpoints?
7. Проверь accessibility: color contrast (особенно для темных/светлых тем), focus indicators.
8. Есть ли форматирование чисел/дат под текущую locale?

Выход: сравнительная таблица + список untranslated strings с путями.
```

### Фаза 6 — Performance + Memory (1 сабагент)

```
Ты — performance-инженер. Исследуй производительность Undefscene editor.

Задача: найти узкие места и утечки памяти.

Требования:
1. Bundle analysis: какой размер main/renderer? Есть ли тяжелые зависимости (framer-motion, @xyflow)?
2. Найди все addEventListener/removeEventListener пары. Есть ли missing cleanup?
3. Найди все setInterval/setTimeout. Очищаются ли при unmount?
4. React Flow: используется ли node virtualization для больших графов (>100 nodes)?
5. Есть ли re-render цепочки (например, изменение одного поля в node триггерит перерисовку всего canvas)?
6. Image blobs / data URLs: освобождаются ли (URL.revokeObjectURL)? Особенно в actor previews и `RoomVisualEditorCanvas.tsx` (LRU cache data URLs).
7. Есть ли memory leak в docking system (накопление закрытых панелей в state)?
8. Проверь массивы в state: используются ли иммутабельные операции или мутирующие (push, splice)?
9. Проверь `usePathEditorLogic.ts` — `simplifyPathPoints` O(n) или O(n²)? При больших path (>500 точек). Undo/redo history неограниченный?

Выход: таблица [Location | Leak/Perf Issue | Severity | Fix].
```

### Фаза 7 — Error Handling + Edge Cases (1 сабагент)

```
Ты — defensive-разработчик. Исследуй обработку ошибок в Undefscene.

Задача: найти незащищённые границы.

Требования:
1. Есть ли Error Boundaries в React? Если нет — какие компоненты могут крашить всё приложение?
2. Все JSON.parse / JSON.stringify: есть ли try/catch? Что происходит при corrupted user data? Проверь особенно `templateStorage.ts` (`deepClone` через `JSON.parse` без try/catch), `yarnPreview.ts` (malformed Yarn input).
3. File IO (main): есть ли atomic writes? Что при прерывании записи (crash mid-write)?
4. IPC invoke без await/catch: где обработка rejected promises?
5. Что происходит при открытии corrupted .yyp или .scene файла?
6. Есть ли graceful degradation при отсутствии screenshot bundle или sprite preview?
7. Проверь все dialog.showMessageBox: есть ли Cancel/Abort flow?
8. Есть ли unhandled promise rejection handlers (process.on / window.onunhandledrejection)?

Выход: таблица [Scenario | Current Behavior | Recommended Fix | Priority].
```

### Фаза 8 — Типизация + Strictness (1 сабагент)

```
Ты — TypeScript-эксперт. Исследуй type safety в Undefscene.

Задача: найти дыры в типизации.

Требования:
1. Найди все `any` в codebase (исключая внешние библиотеки). Для каждого: можно ли заменить на unknown + narrowing?
2. Есть ли `as` type assertions (cast)? Безопасны ли они?
3. Проверь strict mode в tsconfig: включены ли strictNullChecks, noImplicitAny?
4. Есть ли несоответствие типов между preload API и renderer usage (например, invoke возвращает unknown, а renderer ожидает конкретный тип)?
5. Есть ли enum вместо union types? (TypeScript best practice — union > enum)
6. Проверь generic constraints в hooks: правильно ли inferred типы?
7. Есть ли implicit any из-за missing return type annotations в callbacks?
8. Проверь bridge types (VisualEditorBridgeState): дублируются ли типы между main и renderer?
9. Проверь `runtimeTypes.ts` — можно ли усилить `readonly`? Есть ли branded types для node IDs / edge IDs?
10. Проверь `nodeRegistry.ts` — `defaultParams` типизирован как `Record<string, unknown>` (можно ли сделать stricter? не меняя schema, только types).

Выход: таблица [File | Line | Type Issue | Fix].
```

### Фаза 9 — Testing + DevEx (1 сабагент)

```
Ты — QA-инженер. Исследуй тестовую инфраструктуру Undefscene.

Задача: оценить покрытие и developer experience.

Требования:
1. Перечисли все тесты. Что они проверяют? Какие модули НЕ покрыты? Критично: есть ли тесты на `compileGraph.ts` / `reverseCompile.ts` round-trip (export → import → export должен быть идентичен)?
2. Есть ли E2E тесты (Playwright/Cypress)? Если нет — критично ли?
3. Проверь mocks: реалистичны ли они? Нет ли тестов, которые всегда проходят (false positive)?
4. Есть ли CI/CD pipeline? Запускаются ли тесты перед релизом?
5. Проверь package.json scripts: есть ли pre-commit hooks? Запускается ли typecheck перед build?
6. Есть ли dead code (unused exports, functions, imports)? Найди через поиск.
7. Есть ли console.log/console.error в production code (не в dev-only)?
8. Проверь README: актуальны ли инструкции по запуску? Есть ли .env.example?

Выход: список gaps с рекомендациями.
```

### Фаза 10 — Синтез и Roadmap (1 сабагент)

```
Ты — технический лидер. На основе результатов фаз 1-9 создай сводный документ.

Задача: приоритизация и roadmap.

Требования:
1. Собери ВСЕ найденные проблемы из предыдущих фаз.
2. Расставь приоритеты: High (критично, краш/утечка/безопасность), Medium (UX/perf), Low (polish), By Design (не баг), Unsure (требует проверки).
3. Сгруппируй по темам: Security, Performance, Reliability, DX, UI/UX.
4. Создай Roadmap: что править в 1-й итерации (неделя), что во 2-й (месяц).
5. Для каждого High-priority item: напиши конкретный план фикса (файлы, подход).
6. Оцени риски: что может сломаться при исправлении? Для каждого фикса укажи risk tier: Frozen (требует runtime-тест), Audit-only (требует migration plan), Open (безопасно).
7. Пометь, какие фиксы касаются контрактных полей (см. реестр в разделе "Области: классификация риска") — они требуют синхронизации с GML runtime.

Выход: единый markdown-документ, готовый к передаче разработчикам.
```

---

## Подход B: Feature-based аудит (альтернатива)

Используй, если важнее найти баги на стыках слоёв внутри фич, а не внутри слоёв.

### Этап 1: Feature map (1 сабагент)

```
Ты — product-аналитик. Определи все user-facing фичи Undefscene editor.

Задача: составить feature map.

Требования:
1. Перечисли фичи: Node Editor, Inspector, Canvas, Docking, Visual Room Editor, Path Editor, Actor Editor, Yarn Preview, Template Library, Bookmarks, Search, Preferences, Export, Auto-update, Tutorial.
2. Для каждой фичи: какие файлы её реализуют? (от data до UI)
3. Какие фичи зависят от shared hooks/context? Нарисуй dependency graph.
4. Какие фичи используют IPC? Какие — только renderer?

Выход: feature → files mapping.
```

### Этап 2: Feature deep-dive (по 1 сабагенту на фичу, 5-6 параллельно)

```
Ты — fullstack-разработчик. Исследуй фичу [FEATURE_NAME] в Undefscene editor.

Контекст: используй feature map из предыдущего этапа.

Задача: end-to-end аудит фичи от data до UI.

Требования:
1. Data flow: от пользовательского действия → state change → side effect → UI update. Проследи полный путь.
2. i18n: ВСЕ строки в этой фиче переведены? Если нет — перечисли hardcoded.
3. Темы: ВСЕ цвета в этой фиче используют theme tokens / CSS variables?
4. Error handling: что происходит при некорректном вводе, отсутствии данных, сетевой ошибке (если применимо)?
5. Accessibility: keyboard navigation, ARIA labels, focus management.
6. Performance: есть ли утечки памяти, лишние перерисовки, тяжёлые вычисления в render?
7. Edge cases: пустые состояния, максимальные размеры данных, race conditions.
8. Type safety: есть ли any/unknown без narrowing? Соответствие типов между слоями?

Выход: подробный отчёт по фиче с конкретными строками кода и рекомендациями.
```

*(Повторить для каждой major feature из feature map)*

### Этап 3: Cross-feature audit (1-2 сабагента)

```
Ты — системный архитектор. Исследуй взаимодействия между фичами.

Задача: найти проблемы на границах.

Требования:
1. Загрузка проекта: как фичи инициализируются? Есть ли race conditions между загрузкой .yyp и открытием UI?
2. Undo/Redo: охватывает ли ВСЕ фичи или только некоторые? Есть ли "orphaned state"?
3. Export: какие фичи участвуют в экспорте? Есть ли несогласованность данных?
4. Auto-save: какие фичи сохраняются? Что если auto-save случится во время drag-and-drop?
5. Theme switch: перерисовываются ли ВСЕ компоненты или некоторые застревают со старыми цветами?
6. Language switch: перезагружаются ли ВСЕ строки или требуется reload?
7. Window resize / zoom: как ведут себя canvas, docking, visual editor?

Выход: таблица cross-feature issues.
```

### Этап 4: Синтез (1 сабагент)

Идентичен Фазе 10 Подхода A.

---

## Формат выходного документа

> Используется для обоих подходов. Агент синтеза собирает всё в единый файл.

### Название файла
`AUDIT_REPORT_YYYY-MM-DD.md` в корне `D:\GitHub\Undefscene\`

### Структура документа

```markdown
# Audit Report: Undefscene Editor
**Date:** YYYY-MM-DD
**Scope:** editor-app/src
**Auditors:** [agent IDs]

---

## 1. Executive Summary
- Общее количество проблем: X High, Y Medium, Z Low
- Топ-3 риска для продукта
- Рекомендуемая первая итерация (2 недели)

## 2. Architecture Overview
- Диаграмма/описание слоёв (Main ↔ Preload ↔ Renderer)
- Data flow diagram (упрощённо)
- Список entry points и их роли

## 3. Findings by Category

### 3.1 Security (High → Low)
| # | File | Line | Issue | Severity | Fix Recommendation | Effort |
|---|------|------|-------|----------|-------------------|--------|
| 1 | ... | ... | ... | High | ... | 1h |

### 3.2 Performance
[таблица]

### 3.3 Reliability / Error Handling
[таблица]

### 3.4 UI/UX / i18n / Theming
[таблица]

### 3.5 Type Safety
[таблица]

### 3.6 Testing / DX
[таблица]

## 4. i18n Completeness Report
- Процент покрытия: X%
- Список untranslated strings: [File | String | Context]
- Orphaned keys (есть в en.ts, нет в ru.ts): ...

## 5. Theme Coverage Report
- Компоненты с hardcoded цветами: [File | Line | Color]
- CSS variables coverage: X% компонентов
- Dark/light mode gaps: ...

## 6. Memory Leak Report
- Неочищенные listeners: [File | Line | Listener type]
- Неочищенные timers: [File | Line]
- Image/data URL leaks: ...

## 7. Fix Roadmap

### Iteration 1 (Week 1-2): Critical
1. [Issue] → [File] → [Approach]
2. ...

### Iteration 2 (Week 3-4): High Impact
1. ...

### Iteration 3 (Month 2): Polish
1. ...

## 8. Areas Explicitly Not Audited / Caution Zones

See detailed classification below. Three tiers:
- **Frozen** — do not modify without domain expert review and runtime compatibility tests.
- **Audit-only** — safe to audit for bugs/perf/type issues, but schema/algorithm changes require migration plan.
- **Open** — originally over-estimated as risky; safe to refactor after confirmation.

## 9. Appendix: File Inventory
- Полный список файлов с назначением (кратко)
```

---

## Области: классификация риска после перепроверки кода

> Перепроверено: все 9 файлов + `nodeRegistry.ts` + `main/index.ts` прочитаны полностью.

### Tier 1 — Frozen (не трогать без тестов на runtime-совместимость)

| Область | Почему frozen | Что НЕЛЬЗЯ менять | Что МОЖНО аудитить |
|---------|---------------|-------------------|-------------------|
| **compileGraph.ts** | DFS-компиляция графа в `actions[]`. Логика `parallel_start/join`, `guard_global`, `branch`, `mark_node`. | Алгоритм обхода, порядок actions, типы экспортированных объектов | Type safety, error messages (только тексты), performance профилировка |
| **reverseCompile.ts** | Обратный импорт `engine JSON → editor graph`. Симметричный компилятору. | `importSequence`, `guardToEdgePatch`, `connectSourcesToNode`, ID generation | Type safety, edge case handling (malformed input) |
| **validateGraph.ts** | `REQUIRED_PARAMS` для 54 типов нод. Связность графа, `actorKeys`, `markNodeNames`. | Правила валидации, обязательные поля, логика проверок | **i18n текстов ошибок** (183 вызова `t()` — можно переводить), type safety |
| **runtimeTypes.ts** | TypeScript-контракт с GML runtime. | Структура `RuntimeNode`, `RuntimeEdge`, `RuntimeState`, имена полей | `readonly` modifiers, branded types, strict null совместимость |
| **nodeRegistry.ts** | Определяет schema всех нод: `type`, `fields[].key`, `defaultParams`. 1958 строк. | **`fields[].key`** (имена параметров), **`defaultParams`** (значения по умолчанию), **`type`** (строковый тип ноды) | `label`, `placeholder`, `category` — можно i18n-ить и стилизовать; UI-рефакторинг |
| **main/index.ts** (парсинг .yyp) | Чтение `sprites`, `objects`, `sounds`, `rooms` из внутреннего формата GameMaker. | Структура парсинга .yyp, имена извлекаемых полей | Error handling (`JSON.parse` safety), caching race conditions, atomic writes |

### Tier 2 — Audit-only (можно искать баги/perf/type-проблемы, но schema/алгоритм требуют плана миграции)

| Область | Почему audit-only | Что НЕЛЬЗЯ менять без плана | Что МОЖНО аудитить и фиксить |
|---------|-------------------|------------------------------|------------------------------|
| **templateStorage.ts** | Versioned schema (`version: 1`) пользовательских шаблонов в localStorage. | `CutsceneTemplateSnippet` structure, `STORAGE_KEY`, version number | `JSON.parse` без try/catch в `deepClone`, localStorage quota handling, `generateId` fallback качество |
| **RoomVisualEditorCanvas.tsx** | Canvas 2D stitch тайлов скриншотов комнат. Математика: `col * capture_width`. | `ctx.drawImage` координаты, tile positioning logic | `canvas.toDataURL` memory leak (кеш растёт до 8, но data URLs висят), `loadImage` error handling, `cancelled` race condition |

### Tier 3 — Open (были переоценены как рисковые; после проверки — безопасны для рефакторинга)

| Область | Исходная гипотеза | Что оказалось в коде | Рекомендация |
|---------|------------------|----------------------|--------------|
| **CutsceneNodes.tsx** | "Domain logic нод, не трогать" | Чистые **UI-компоненты** (`React.memo`). Рендерят `data.params` через `BaseNode`. Нет алгоритмов. | **Полный аудит UI-слоя**: i18n gaps (есть ноды без `t()` — `SetPositionNode`, `SetPositionRelativeNode`, `ActorCreateNode` и др.), стили, `key` props. **Не трогать имена параметров** (`target`, `actor_name`, `seconds`) — это контракт. |
| **yarnPreview.ts** | "Reverse-engineered формат, не трогать" | **Стандартный Yarn Spinner** формат: `title: Foo\n---\nbody\n===`. Line-based парсер. | Полный аудит: malformed input, empty body, edge cases, empty title, много `===` подряд. Риск изменений — низкий. |
| **usePathEditorLogic.ts** | "Кривые Безье, не трогать" | **НЕТ кривых Безье!** Просто массив точек + `simplifyPathPoints` (collinear removal через cross/dot product). Undo/redo через `pathHistoryRef`. | Полный аудит: performance `simplifyPathPoints` (O(n²) на больших путях?), undo/redo границы, `PATH_ERASE_RADIUS` hardcoded, `draftPathPointsRef` vs `draftPathPoints` sync race. |

> **Исключение для всех тиров**: Если аудит покажет type safety проблемы или очевидный memory leak — фиксить, но для Tier 1 и Tier 2 ТОЛЬКО после создания backup-теста на оригинальное поведение.

### Реестр контрактных полей (нельзя переименовывать/менять тип)

Эти имена используются в runtime движка Undefinedtale:

- `RuntimeNode.params`: `target`, `actor_name`, `actor_sprite`, `seconds`, `x`, `y`, `speed_px_sec`, `file`, `node`, `sprite`, `image_index`, `condition`, `function`/`function_name`, `room`, `sound`, `key`, `object`, `property`, `value`, `enabled`, `points`, `delay_seconds`, `action_type`, `checkpoint_id`, `intro`, `loop`, `calm`, `battle`, `phases`, `intensity`, `copy_target`, `collision`, `offset_x`, `offset_y`, `follow_facing`, `follow_scale`, `follow_depth`, `duration_seconds`, `detach_on_cutscene_end`, `destroy_after_detach`
- `RuntimeNode.type`: все строковые типы из `nodeRegistry.ts` (`start`, `end`, `wait`, `move`, `dialogue`, `parallel_start`, `parallel_join`, `branch`, `actor_create`, `actor_destroy`, `animate`, `set_animation_frame`, `camera_track`, `camera_pan`, `camera_shake`, `set_depth`, `set_facing`, `follow_path`, `run_function`, `set_position`, `move_relative`, `set_position_relative`, `tween`, `tween_camera`, `set_property`, `emote`, `jump`, `halt`, `flip`, `spin`, `shake_object`, `set_visible`, `instant_mode`, `mark_node`, `partial_control`, `wait_for_interact`, `wait_until`, `set_flag`, `spawn_entity`, `destroy_entity`, `play_music`, `stop_music`, `music_volume`, `music_duck`, `music_unduck`, `music_pitch`, `music_pause`, `music_resume`, `play_boss_music`, `stop_boss_music`, `boss_music_phase`, `play_music_intro`, `play_music_intro_layered`, `crossfade_music`, `set_plot`, `schedule_action`, `attach_to_target`, `detach`, `checkpoint_state`, `restore_state`, `room_change`, `lerp`)
- `RuntimeEdge`: `waitSeconds`, `conditionEnabled`, `conditionVar`, `conditionEquals`, `conditionIfFalse`, `stopWaitingWhen`, `endConditionVar`, `endConditionEquals`, `endNodeName`, `endTimeoutSeconds`
- `CompiledAction` (compileGraph output): `type`, `var`, `equals`, `if_false`, `actions`, `stop_when`, `end_var`, `end_equals`, `end_node`, `end_timeout`, `name`, `seconds`

---

## Примечания по запуску

- **Квота**: В текущей сессии Devin daily quota на сабагентов исчерпана. Запускать промпты следует в новой сессии.
- **Batching**: Фазы 2-9 Подхода A можно запускать параллельно по 4-5 агентов, НО каждый агент должен читать summary фазы 1 (если применимо).
- **Контекст**: Для feature-based подхода каждый агент должен получить feature map из Этапа 1.
- **Validation**: После синтеза рекомендуется запустить 1 валидирующего агента, который перепроверит 10% случайных finding'ов.
