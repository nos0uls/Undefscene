# Design Document: Camera Composition Guides (Wave 3)

## 1. Обзор фичи

### Описание
Camera Composition Guides — это визуальный overlay в `RoomVisualEditorModal`, который показывает направляющие для композиции кадра:
- Rule of thirds (сетка 3x3)
- Центральные линии
- Safe area для UI/диалога
- Viewport камеры

### Use Cases
1. Красивое кадрирование персонажей (не обрезаны ноги, лица в центре)
2. Планирование диалоговых сцен (окно не закрывает лица)
3. Создание cinematic shots

---

## 2. Текущее состояние

### Editor
- `RoomVisualEditorModal.tsx` — окно редактирования позиций актёров на скриншоте комнаты
- `RoomVisualEditorOverlay.tsx` — SVG overlay с сеткой, path и actor markers
- Нет направляющих композиции

### GML Runtime
- `camera_track`, `camera_pan`, `camera_center` — управляют камерой
- Нет встроенной информации о safe area

---

## 3. Предложенная реализация

### Архитектура
Editor-only визуальный overlay. Не сохраняется в JSON.

### 3.1 Модель данных

```typescript
type CompositionGuideType =
  | 'rule_of_thirds'
  | 'center'
  | 'safe_area'
  | 'dialogue_safe_area'

type CompositionGuideConfig = {
  guideType: CompositionGuideType
  enabled: boolean
  color: string
  strokeWidth: number
}

type CameraCompositionParams = {
  camera_x: number
  camera_y: number
  camera_width: number
  camera_height: number
}
```

### 3.2 Модуль cameraCompositionGuides.ts

```typescript
function calculateCameraViewport(
  params: CameraCompositionParams,
  roomWidth: number,
  roomHeight: number
) {
  return {
    x: params.camera_x - params.camera_width / 2,
    y: params.camera_y - params.camera_height / 2,
    width: params.camera_width,
    height: params.camera_height
  }
}

function calculateRuleOfThirds(viewport: { x: number; y: number; width: number; height: number }) {
  return [
    // Вертикальные линии
    { x1: viewport.x + viewport.width / 3, y1: viewport.y, x2: viewport.x + viewport.width / 3, y2: viewport.y + viewport.height },
    { x1: viewport.x + 2 * viewport.width / 3, y1: viewport.y, x2: viewport.x + 2 * viewport.width / 3, y2: viewport.y + viewport.height },
    // Горизонтальные линии
    { x1: viewport.x, y1: viewport.y + viewport.height / 3, x2: viewport.x + viewport.width, y2: viewport.y + viewport.height / 3 },
    { x1: viewport.x, y1: viewport.y + 2 * viewport.height / 3, x2: viewport.x + viewport.width, y2: viewport.y + 2 * viewport.height / 3 }
  ]
}

function calculateDialogueSafeArea(
  viewport: { x: number; y: number; width: number; height: number },
  dialogueHeight: number,
  margin: number
) {
  return {
    x: viewport.x,
    y: viewport.y + viewport.height - dialogueHeight - margin,
    width: viewport.width,
    height: dialogueHeight
  }
}
```

### 3.3 Компонент CameraCompositionGuideOverlay.tsx

```typescript
export function CameraCompositionGuideOverlay({
  roomWidth,
  roomHeight,
  cameraParams,
  guides,
  dialogueSafeAreaHeight,
  dialogueSafeAreaMargin,
  opacity
}: {
  roomWidth: number
  roomHeight: number
  cameraParams: CameraCompositionParams
  guides: CompositionGuideConfig[]
  dialogueSafeAreaHeight: number
  dialogueSafeAreaMargin: number
  opacity: number
}): React.JSX.Element {
  // SVG overlay:
  // 1. Viewport камеры (прямоугольник)
  // 2. Линии rule of thirds
  // 3. Safe area для диалога (прямоугольник с заливкой)
  // 4. Подсказки
}
```

### 3.4 Панель управления CompositionGuidesPanel.tsx

```typescript
export function CompositionGuidesPanel({
  cameraParams,
  onCameraParamsChange,
  selectedGuides,
  onSelectedGuidesChange
}: {
  cameraParams: CameraCompositionParams
  onCameraParamsChange: (params: CameraCompositionParams) => void
  selectedGuides: CompositionGuideType[]
  onSelectedGuidesChange: (guides: CompositionGuideType[]) => void
}): React.JSX.Element {
  // Camera X, Y, Width, Height inputs
  // Checkboxes для каждого типа guide
  // Preset buttons: 320x180, 640x360, 800x600
}
```

### 3.5 Интеграция в RoomVisualEditorModal.tsx

```typescript
const [showCompositionGuides, setShowCompositionGuides] = useState(true)
const [cameraParams, setCameraParams] = useState<CameraCompositionParams>({
  camera_x: roomWidth / 2,
  camera_y: roomHeight / 2,
  camera_width: 320,
  camera_height: 180
})
```

---

## 4. JSON Schema

Нет изменений. Guides — editor-only.

---

## 5. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/cameraCompositionGuides.ts` | **Новый** — вычисления |
| `editor/CameraCompositionGuideOverlay.tsx` | **Новый** — SVG overlay |
| `editor/CompositionGuidesPanel.tsx` | **Новый** — управление |
| `editor/RoomVisualEditorModal.tsx` | Интеграция overlay и панели |
| `editor/PreferencesContext.tsx` | `showCompositionGuides`, `compositionGuideOpacity` |

---

## 6. Оценка сложности и риска

### Сложность: **НИЗКАЯ-СРЕДНЯЯ** ⭐
- Простая геометрия
- Стандартный SVG рендеринг
- Минимальная интеграция

### Риск: **НИЗКИЙ**
1. Визуальный беспорядок — toggles и opacity slider решают
2. Неточность camera params — валидация > 0
3. Синхронизация с camera nodes — опционально, guides только для preview

---

## 7. Открытые вопросы

1. Preset размеры камеры — конфигурируемые?
2. Привязка к camera nodes (автообновление params при выборе camera_pan)?
3. Aspect ratio lock?
