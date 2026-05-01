import React, { useState, useEffect, useCallback } from 'react'

type TutorialStep = {
  selector?: string
  title: { en: string; ru: string }
  content: { en: string; ru: string }
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

const STEPS: TutorialStep[] = [
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
      en: 'You are now ready to create amazing cutscenes. Happy editing!', 
      ru: 'Теперь вы готовы создавать потрясающие катсцены. Приятной работы!' 
    },
    position: 'center'
  }
]

type TutorialOverlayProps = {
  active: boolean
  language: 'en' | 'ru'
  onComplete: () => void
  onSkip: () => void
}

export function TutorialOverlay({
  active,
  language,
  onComplete,
  onSkip
}: TutorialOverlayProps): React.JSX.Element | null {
  const [stepIndex, setStepIndex] = useState(0)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  const currentStep = STEPS[stepIndex]

  const updateHighlight = useCallback(() => {
    if (!currentStep.selector) {
      setHighlightRect(null)
      return
    }

    const el = document.querySelector(currentStep.selector)
    if (el) {
      setHighlightRect(el.getBoundingClientRect())
    } else {
      setHighlightRect(null)
    }
  }, [currentStep.selector])

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

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (stepIndex < STEPS.length - 1) {
          setStepIndex(stepIndex + 1)
        } else {
          onComplete()
        }
      } else if (e.key === 'Escape') {
        onSkip()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, stepIndex, onComplete, onSkip])

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

  return (
    <div 
      style={{
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
      }}
    >
      <div
        style={{
          position: 'absolute',
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
          ...tooltipStyle()
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-default)' }}>
          {currentStep.title[language]}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ev-c-text-2)' }}>
          {currentStep.content[language]}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--ev-c-text-3)' }}>
            {language === 'ru' ? 'Esc - пропустить' : 'Esc to skip'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
             <div style={{ fontSize: 11, color: 'var(--ev-c-text-3)', alignSelf: 'center' }}>
                {stepIndex + 1} / {STEPS.length}
             </div>
             <button 
                className="runtimeButton"
                onClick={() => {
                  if (stepIndex < STEPS.length - 1) {
                    setStepIndex(stepIndex + 1)
                  } else {
                    onComplete()
                  }
                }}
                style={{ backgroundColor: 'var(--accent-default)', color: 'white', border: 'none' }}
             >
                {stepIndex < STEPS.length - 1 
                  ? (language === 'ru' ? 'Далее (Enter)' : 'Next (Enter)')
                  : (language === 'ru' ? 'Завершить' : 'Finish')}
             </button>
          </div>
        </div>
      </div>
    </div>
  )
}
