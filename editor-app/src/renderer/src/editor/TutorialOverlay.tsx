import { useState, useEffect, useCallback, useMemo } from 'react'
import { createTranslator, SupportedLanguage } from '../i18n'
import { type TutorialStep, TUTORIAL_REGISTRY } from './tutorialConstants'

type TutorialOverlayProps = {
  active: boolean
  language: SupportedLanguage
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
  const steps = stepsProp ?? TUTORIAL_REGISTRY.onboarding

  // Текущий индекс шага. Сбрасываем в 0 при каждой активации.
  const [stepIndex, setStepIndex] = useState(0)

  // Bounding box подсвеченного DOM-элемента.
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  const t = useMemo(() => createTranslator(language), [language])

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
  const clipPathStyle = highlightRect
    ? {
        clipPath: `polygon(
      0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
      ${highlightRect.left}px ${highlightRect.top}px,
      ${highlightRect.right}px ${highlightRect.top}px,
      ${highlightRect.right}px ${highlightRect.bottom}px,
      ${highlightRect.left}px ${highlightRect.bottom}px,
      ${highlightRect.left}px ${highlightRect.top}px
    )`
      }
    : {}

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
        bottom: window.innerHeight - highlightRect.top + padding,
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
        right: window.innerWidth - highlightRect.left + padding,
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
    zIndex: 'var(--z-modal-overlay)',
    transition: 'all 0.3s ease',
    pointerEvents: 'none',
    ...clipPathStyle
  }

  const tooltipBoxStyle: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: '20px 24px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    color: 'var(--text-primary)',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 'var(--z-modal)',
    ...tooltipStyle()
  }

  return (
    <>
      <div style={overlayStyle} />
      <div style={tooltipBoxStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-default)' }}>
          {t(currentStep.title)}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {renderContentWithLinks(t(currentStep.content))}
        </div>

        {/* Навигация: счётчик, стрелки назад/вперёд, пропуск. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('tutorial.escToSkip', language === 'ru' ? 'Esc — пропустить' : 'Esc to skip')}
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
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                opacity: stepIndex <= 0 ? 0.4 : 1,
                cursor: stepIndex <= 0 ? 'not-allowed' : 'pointer'
              }}
              title={t('tutorial.prev', language === 'ru' ? 'Назад (←)' : 'Previous (←)')}
            >
              ←
            </button>

            {/* Счётчик шагов. */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>
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
                ? t('tutorial.next', language === 'ru' ? 'Далее (→)' : 'Next (→)')
                : t('tutorial.finish', language === 'ru' ? 'Завершить' : 'Finish')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
