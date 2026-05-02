// TutorialOverlay.tsx — Интерактивный пошаговый тур по UI редактора.
// Подсвечивает DOM-элементы через clip-path и показывает карточку с подсказкой.
// Поддерживает навигацию вперед/назад, клавиатуру и сброс при повторном запуске.

import { useState, useEffect, useCallback } from 'react'

// Позиция тултипа относительно подсвеченного элемента.
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'

// Один шаг тура. Может ссылаться на DOM-элемент через selector.
export type TutorialStep = {
  selector?: string
  title: { en: string; ru: string }
  content: { en: string; ru: string }
  position?: TooltipPosition
}

const ONBOARDING_STEPS: TutorialStep[] = [
  {
    title: { en: 'Welcome to Undefscene!', ru: 'Добро пожаловать в Undefscene!' },
    content: { 
      en: 'This tutorial will quickly show you the main interface elements. Press Enter to continue or Esc to skip.', 
      ru: 'Этот тур быстро покажет вам основные элементы интерфейса. Нажмите Enter для продолжения или Esc, чтобы пропустить.' 
    },
    position: 'center'
  },
  {
    selector: '.topMenuBar',
    title: { en: 'Top Menu Bar', ru: 'Верхнее меню' },
    content: { 
      en: 'Here you can open projects, save scenes, export to GameMaker, and access settings.', 
      ru: 'Здесь вы можете открывать проекты, сохранять сцены, экспортировать в GameMaker и менять настройки.' 
    },
    position: 'bottom'
  },
  {
    selector: '.editorLeftDock',
    title: { en: 'Node Palette', ru: 'Палитра нод' },
    content: { 
      en: 'Drag and drop nodes from the palette to the canvas to build your cutscene logic.', 
      ru: 'Перетаскивайте ноды из палитры на холст, чтобы строить логику вашей катсцены.' 
    },
    position: 'right'
  },
  {
    selector: '.editorCenter',
    title: { en: 'The Canvas', ru: 'Холст' },
    content: { 
      en: 'This is where you visualize and connect your cutscene nodes. Use mouse wheel to zoom and drag to pan.', 
      ru: 'Здесь вы визуализируете и соединяете ноды. Используйте колесо мыши для зума и перетаскивание для панорамирования.' 
    },
    position: 'center'
  },
  {
    selector: '.editorRightDock',
    title: { en: 'Inspector', ru: 'Инспектор' },
    content: { 
      en: 'Select a node to edit its parameters (like coordinates, text, or animations) here.', 
      ru: 'Выберите ноду, чтобы редактировать её параметры (координаты, текст, анимации) здесь.' 
    },
    position: 'left'
  },
  {
    selector: '.editorBottomDock',
    title: { en: 'Logs & Warnings', ru: 'Логи и ошибки' },
    content: { 
      en: 'Keep an eye on this panel for validation errors or tips while building your scene.', 
      ru: 'Следите за этой панелью: здесь появляются ошибки валидации или подсказки при сборке сцены.' 
    },
    position: 'top'
  },
  {
    title: { en: 'Ready to go!', ru: 'Всё готово!' },
    content: {
      en: 'You are now ready to create amazing cutscenes. Check the docs for advanced topics.',
      ru: 'Теперь вы готовы создавать потрясающие катсцены. Документация расскажет о продвинутых возможностях.'
    },
    position: 'center'
  }
]

// Шаги тура по инспектору (контекстный).
const INSPECTOR_STEPS: TutorialStep[] = [
  {
    selector: '.editorRightDock',
    title: { en: 'Inspector Panel', ru: 'Панель инспектора' },
    content: {
      en: 'Here you edit the selected node\'s parameters: coordinates, dialogue file, actor target, and more.',
      ru: 'Здесь редактируются параметры выбранной ноды: координаты, файл диалога, цель актёра и другое.'
    },
    position: 'left'
  },
  {
    selector: '.editorRightDock .paramField',
    title: { en: 'Node Parameters', ru: 'Параметры ноды' },
    content: {
      en: 'Each field maps to a GameMaker cutscene action. Hover over labels to see hints.',
      ru: 'Каждое поле соответствует action в GameMaker. Наведите на название поля — появится подсказка.'
    },
    position: 'left'
  },
  {
    title: { en: 'Editing Complete', ru: 'Редактирование завершено' },
    content: {
      en: 'You can return to the canvas anytime. Docs: https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/',
      ru: 'Вы можете вернуться на холст в любой момент. Документация: https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/'
    },
    position: 'center'
  }
]

// Шаги тура по visual editing (контекстный).
const VISUAL_EDITING_STEPS: TutorialStep[] = [
  {
    selector: '.roomScreenshotCanvas',
    title: { en: 'Room Preview', ru: 'Превью комнаты' },
    content: {
      en: 'This is the stitched room screenshot. Use it to draw actor paths or place markers precisely.',
      ru: 'Это склеенный скриншот комнаты. Рисуйте пути актёров или расставляйте маркеры точно по обстановке.'
    },
    position: 'center'
  },
  {
    selector: '.visualEditorToolbar',
    title: { en: 'Toolbar', ru: 'Панель инструментов' },
    content: {
      en: 'Select a tool: draw path points, place actor markers, or preview the animation.',
      ru: 'Выберите инструмент: точки пути, маркеры актёров или предпросмотр анимации.'
    },
    position: 'bottom'
  },
  {
    title: { en: 'Visual Editing Ready', ru: 'Визуальное редактирование готово' },
    content: {
      en: 'Click Import to write changes back to the graph. Docs: https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/',
      ru: 'Нажмите Import, чтобы записать изменения обратно в граф. Документация: https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/'
    },
    position: 'center'
  }
]

// Реестр доступных туров по идентификатору.
export const TUTORIAL_REGISTRY: Record<string, TutorialStep[]> = {
  onboarding: ONBOARDING_STEPS,
  inspector: INSPECTOR_STEPS,
  visualEditing: VISUAL_EDITING_STEPS
}

type TutorialOverlayProps = {
  active: boolean
  language: 'en' | 'ru'
  // Если не передан — используем онбординг по умолчанию.
  steps?: TutorialStep[]
  onComplete: () => void
  onSkip: () => void
}

// Рендерит текст, оборачивая http(s) URL в кликабельные ссылки.
// Клик открывает ссылку через main процесс (shell.openExternal) безопасно.
function renderContentWithLinks(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/
  const parts = text.split(urlRegex)

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href="#"
          onClick={(e) => {
            e.preventDefault()
            window.api.appInfo.openExternal(part)
          }}
          style={{
            color: 'var(--accent-default)',
            textDecoration: 'underline',
            cursor: 'pointer'
          }}
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function TutorialOverlay({
  active,
  language,
  steps: stepsProp,
  onComplete,
  onSkip
}: TutorialOverlayProps): React.JSX.Element | null {
  // Выбранный набор шагов.
  const steps = stepsProp ?? ONBOARDING_STEPS

  // Текущий индекс шага. Сбрасываем в 0 при каждой активации.
  const [stepIndex, setStepIndex] = useState(0)

  // Bounding box подсвеченного DOM-элемента.
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  // При активации всегда начинаем с первого шага.
  useEffect(() => {
    if (active) {
      setStepIndex(0)
      setHighlightRect(null)
    }
  }, [active, steps])

  const currentStep = steps[stepIndex]

  // Обновляем highlight-rect выбранного элемента.
  // Если rect имеет нулевые размеры (элемент ещё не отрисован/скрыт) —
  // считаем, что элемент не найден, и показываем центрированный шаг.
  const updateHighlight = useCallback(() => {
    if (!currentStep?.selector) {
      setHighlightRect(null)
      return
    }

    const el = document.querySelector(currentStep.selector)
    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setHighlightRect(rect)
        return
      }
    }
    setHighlightRect(null)
  }, [currentStep?.selector])

  useEffect(() => {
    if (!active) return

    updateHighlight()
    window.addEventListener('resize', updateHighlight)
    
    const interval = setInterval(updateHighlight, 500) // Defensive update for layout changes

    return () => {
      window.removeEventListener('resize', updateHighlight)
      clearInterval(interval)
    }
  }, [active, updateHighlight])

  // Обработка клавиатуры: Enter — далее, Esc — пропустить, ← → — навигация.
  useEffect(() => {
    if (!active) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (stepIndex < steps.length - 1) {
          setStepIndex(stepIndex + 1)
        } else {
          onComplete()
        }
      } else if (e.key === 'Escape') {
        onSkip()
      } else if (e.key === 'ArrowRight') {
        if (stepIndex < steps.length - 1) {
          setStepIndex(stepIndex + 1)
        }
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) {
          setStepIndex(stepIndex - 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, stepIndex, steps.length, onComplete, onSkip])

  if (!active) return null

  // Generate clip-path for highlighting
  // We use 8 points to create a "hole" in the dark overlay
  const clipPathStyle = highlightRect ? {
    clipPath: `polygon(
      0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
      ${highlightRect.left}px ${highlightRect.top}px,
      ${highlightRect.right}px ${highlightRect.top}px,
      ${highlightRect.right}px ${highlightRect.bottom}px,
      ${highlightRect.left}px ${highlightRect.bottom}px,
      ${highlightRect.left}px ${highlightRect.top}px
    )`
  } : {}

  const tooltipStyle = (): React.CSSProperties => {
    if (!highlightRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 400
      }
    }

    const padding = 20
    const pos = currentStep.position || 'center'

    if (pos === 'bottom') {
      return {
        top: highlightRect.bottom + padding,
        left: highlightRect.left + highlightRect.width / 2,
        transform: 'translateX(-50%)',
        maxWidth: 400
      }
    }
    if (pos === 'top') {
      return {
        bottom: (window.innerHeight - highlightRect.top) + padding,
        left: highlightRect.left + highlightRect.width / 2,
        transform: 'translateX(-50%)',
        maxWidth: 400
      }
    }
    if (pos === 'right') {
      return {
        top: highlightRect.top + highlightRect.height / 2,
        left: highlightRect.right + padding,
        transform: 'translateY(-50%)',
        maxWidth: 300
      }
    }
    if (pos === 'left') {
      return {
        top: highlightRect.top + highlightRect.height / 2,
        right: (window.innerWidth - highlightRect.left) + padding,
        transform: 'translateY(-50%)',
        maxWidth: 300
      }
    }

    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: 400
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 10000,
    transition: 'all 0.3s ease',
    pointerEvents: 'none',
    ...clipPathStyle
  }

  const tooltipBoxStyle: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: 'var(--color-background-soft)',
    border: '1px solid var(--ev-c-gray-3)',
    borderRadius: 8,
    padding: '20px 24px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    color: 'var(--ev-c-text-1)',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 10001,
    ...tooltipStyle()
  }

  return (
    <>
      <div style={overlayStyle} />
      <div style={tooltipBoxStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-default)' }}>
          {currentStep.title[language]}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ev-c-text-2)' }}>
          {renderContentWithLinks(currentStep.content[language])}
        </div>
        
        {/* Навигация: счётчик, стрелки назад/вперёд, пропуск. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--ev-c-text-3)' }}>
            {language === 'ru' ? 'Esc — пропустить' : 'Esc to skip'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Кнопка «Назад» (неактивна на первом шаге). */}
            <button
              className="runtimeButton"
              disabled={stepIndex <= 0}
              onClick={() => {
                if (stepIndex > 0) setStepIndex(stepIndex - 1)
              }}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--ev-c-text-2)',
                border: '1px solid var(--ev-c-gray-3)',
                opacity: stepIndex <= 0 ? 0.4 : 1,
                cursor: stepIndex <= 0 ? 'not-allowed' : 'pointer'
              }}
              title={language === 'ru' ? 'Назад (←)' : 'Previous (←)'}
            >
              ←
            </button>

            {/* Счётчик шагов. */}
            <div style={{ fontSize: 11, color: 'var(--ev-c-text-3)', userSelect: 'none' }}>
              {stepIndex + 1} / {steps.length}
            </div>

            {/* Кнопка «Вперёд / Завершить». */}
            <button
              className="runtimeButton"
              onClick={() => {
                if (stepIndex < steps.length - 1) {
                  setStepIndex(stepIndex + 1)
                } else {
                  onComplete()
                }
              }}
              style={{ backgroundColor: 'var(--accent-default)', color: 'white', border: 'none' }}
            >
              {stepIndex < steps.length - 1
                ? (language === 'ru' ? 'Далее (→)' : 'Next (→)')
                : (language === 'ru' ? 'Завершить' : 'Finish')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
