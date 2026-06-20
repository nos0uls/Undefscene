/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useEffect } from 'react'

import { PreferencesModal } from './PreferencesModal'
import { WelcomeSetupModal } from './WelcomeSetupModal'
import { TutorialOverlay } from './TutorialOverlay'
import { TUTORIAL_REGISTRY } from './tutorialConstants'
import { AboutModal } from './AboutModal'
import type { NameConflictModalState } from './inspectorTypes'
import type { EditorPreferences } from './usePreferences'
import type { RuntimeState } from './runtimeTypes'

export interface EditorShellModalsProps {
  preferencesOpen: boolean
  preferences: EditorPreferences
  updatePreferences: (prefs: Partial<EditorPreferences>) => void
  setPreferencesOpen: (open: boolean) => void
  welcomeOpen: boolean
  handleWelcomeComplete: () => void
  isTutorialActive: boolean
  handleTutorialComplete: () => void
  handleTutorialSkip: () => void
  inspectorTutorialActive: boolean
  handleInspectorTutorialComplete: () => void
  handleInspectorTutorialSkip: () => void
  visualEditingTutorialActive: boolean
  handleVisualEditingTutorialComplete: () => void
  handleVisualEditingTutorialSkip: () => void
  aboutOpen: boolean
  appVersion: string
  handleOpenDocs: () => void
  setAboutOpen: (open: boolean) => void
  nameConflictModal: NameConflictModalState | null
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  setNameConflictModal: (state: NameConflictModalState | null) => void
  nameConflictOkRef: React.RefObject<HTMLButtonElement | null>
  runtime: RuntimeState
  setRuntime: (updater: (prev: RuntimeState) => RuntimeState) => void
  t: (key: string, fallback: string) => string
}

export function EditorShellModals({
  preferencesOpen,
  preferences,
  updatePreferences,
  setPreferencesOpen,
  welcomeOpen,
  handleWelcomeComplete,
  isTutorialActive,
  handleTutorialComplete,
  handleTutorialSkip,
  inspectorTutorialActive,
  handleInspectorTutorialComplete,
  handleInspectorTutorialSkip,
  visualEditingTutorialActive,
  handleVisualEditingTutorialComplete,
  handleVisualEditingTutorialSkip,
  aboutOpen,
  appVersion,
  handleOpenDocs,
  setAboutOpen,
  nameConflictModal,
  setPendingNodeName,
  setNameConflictModal,
  nameConflictOkRef,
  setRuntime,
  t
}: EditorShellModalsProps) {
  // Escape handler for NameConflictModal.
  useEffect(() => {
    if (!nameConflictModal) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPendingNodeName(nameConflictModal.previousName)
        setNameConflictModal(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nameConflictModal, setPendingNodeName, setNameConflictModal])

  return (
    <>
      <PreferencesModal
        open={preferencesOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        onClose={() => setPreferencesOpen(false)}
      />

      <WelcomeSetupModal
        open={welcomeOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        onComplete={handleWelcomeComplete}
      />

      <TutorialOverlay
        active={isTutorialActive}
        language={preferences.language}
        onComplete={handleTutorialComplete}
        onSkip={handleTutorialSkip}
      />

      <TutorialOverlay
        active={inspectorTutorialActive}
        language={preferences.language}
        steps={TUTORIAL_REGISTRY.inspector}
        onComplete={handleInspectorTutorialComplete}
        onSkip={handleInspectorTutorialSkip}
      />

      <TutorialOverlay
        active={visualEditingTutorialActive}
        language={preferences.language}
        steps={TUTORIAL_REGISTRY.visualEditing}
        onComplete={handleVisualEditingTutorialComplete}
        onSkip={handleVisualEditingTutorialSkip}
      />

      <AboutModal
        open={aboutOpen}
        version={appVersion}
        onOpenDocs={handleOpenDocs}
        language={preferences.language}
        onClose={() => setAboutOpen(false)}
      />

      {nameConflictModal ? (
        <div
          className="prefsOverlay"
          onClick={() => {
            setPendingNodeName(nameConflictModal.previousName)
            setNameConflictModal(null)
          }}
        >
          <div className="prefsModal" role="alertdialog" aria-modal="true" aria-label={t('dialog.duplicateNodeNameTitle', 'Duplicate node name')} onClick={(e) => e.stopPropagation()}>
            <div className="prefsHeader">
              <span className="prefsTitle">
                {t('dialog.duplicateNodeNameTitle', 'Duplicate node name')}
              </span>
              <button
                className="prefsCloseBtn"
                onClick={() => {
                  setPendingNodeName(nameConflictModal.previousName)
                  setNameConflictModal(null)
                }}
              >
                {'\u2715'}
              </button>
            </div>

            <div className="prefsBody">
              <div className="prefsHint">
                {t('dialog.duplicateNodeNameMessage', 'This name is already used by another node')}
                {nameConflictModal.conflictingWithNodeId
                  ? ` (${nameConflictModal.conflictingWithNodeId})`
                  : ''}
                {t(
                  'dialog.duplicateNodeNameHint',
                  '. Duplicates are allowed, but it can be confusing.'
                )}
              </div>

              <label className="prefsField">
                <span>{t('editor.nodeName', 'Name')}</span>
                <input
                  className="prefsInput"
                  value={nameConflictModal.value}
                  onChange={(e) =>
                    setNameConflictModal({
                      ...nameConflictModal,
                      value: e.target.value
                    })
                  }
                />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    setPendingNodeName(nameConflictModal.previousName)
                    setNameConflictModal(null)
                  }}
                >
                  {t('dialog.cancelLabel', 'Cancel')}
                </button>
                <button
                  ref={nameConflictOkRef}
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    const v = nameConflictModal.value
                    setPendingNodeName(v)
                    setRuntime((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                        n.id === nameConflictModal.nodeId ? { ...n, name: v.trim() } : n
                      )
                    }))
                    setNameConflictModal(null)
                  }}
                >
                  {t('dialog.okLabel', 'OK')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
