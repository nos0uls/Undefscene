import { useEffect, useRef } from 'react'
import { createTranslator, type SupportedLanguage } from '../i18n'

// Пропсы About modal.
// Храним их простыми, чтобы модалка была переиспользуемой и не знала про EditorShell детали.
type AboutModalProps = {
  // Показана ли модалка.
  open: boolean

  // Текущая версия приложения.
  version: string

  // Открыть документацию во внешнем браузере.
  onOpenDocs: () => void

  // Текущий язык интерфейса.
  language: SupportedLanguage

  // Закрыть модалку.
  onClose: () => void
}

// About modal — небольшое окно с версией приложения и ссылкой на документацию.
// Держим его отдельным компонентом, чтобы не раздувать EditorShell ещё сильнее.
export function AboutModal({
  open,
  version,
  onOpenDocs,
  language,
  onClose
}: AboutModalProps): React.JSX.Element | null {
  // Нужен, чтобы закрывать окно кликом по затемнённому фону.
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Лёгкий translator для статического текста модалки.
  const t = createTranslator(language)

  // Поддержка закрытия по Escape.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="prefsOverlay"
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onClose()
        }
      }}
    >
      <div className="prefsModal">
        <div className="prefsHeader">
          <span className="prefsTitle">{t('app.about', 'About')} Undefscene Editor</span>
          <button className="prefsCloseBtn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="prefsBody">
          <div className="prefsSection">
            <div className="prefsSectionTitle">Application</div>
            <div className="prefsHint" style={{ fontStyle: 'normal' }}>
              {language === 'ru'
                ? 'Undefscene Editor — desktop node-based editor для катсцен GameMaker.'
                : 'Undefscene Editor — desktop node-based editor for GameMaker cutscenes.'}
            </div>
            <div className="prefsField">
              <span>{t('app.version', 'Version')}</span>
              <code>{version}</code>
            </div>
          </div>

          <div className="prefsSection">
            <div className="prefsSectionTitle">Documentation</div>
            <div className="prefsHint" style={{ fontStyle: 'normal' }}>
              {language === 'ru'
                ? 'Открывает руководство по Undefscene editor на публичном сайте документации.'
                : 'Opens the Undefscene editor guide in the public documentation site.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="runtimeButton" type="button" onClick={onOpenDocs}>
                {language === 'ru' ? 'Открыть документацию' : 'Open Documentation'}
              </button>
              <button className="runtimeButton" type="button" onClick={onClose}>
                {t('app.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
