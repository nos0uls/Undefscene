/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, useRef } from 'react'
import type { RuntimeState } from './runtimeTypes'
import {
  createDefaultRuntimeState,
  createEmptyRuntimeState,
  parseRuntimeState
} from './runtimeTypes'
import { reverseCompileCutscene } from './reverseCompile'
import { compileGraph, stripExport } from './compileGraph'
import type { Translator } from './compileGraph'
import type { ValidationResult } from './validateGraph'
import { pushSuccess, pushError, pushWarning } from './ToastHub'
import type { ToastContextValue } from './ToastHub'
import type { ConfirmOptions } from './ConfirmDialog'

// Параметры, которые нужны хуку для работы с файлами сцены.
type UseSceneIODeps = {
  // Текущее runtime-состояние сцены (ноды, рёбра, выбор).
  runtime: RuntimeState
  // Ref на runtime — нужен для autosave, чтобы читать свежее состояние без зависимости.
  runtimeRef: React.MutableRefObject<RuntimeState>
  // Обновление runtime (при открытии/новой сцене).
  setRuntime: React.Dispatch<React.SetStateAction<RuntimeState>>
  // Результат валидации — проверяем перед экспортом.
  validation: ValidationResult
  // Текущий путь к файлу сцены (null = ещё не сохранялась).
  sceneFilePath: string | null
  // Обновление пути к файлу сцены.
  setSceneFilePath: (path: string | null) => void
  // Toast API для уведомлений.
  toasts: ToastContextValue
  // Confirm dialog для подтверждения опасных действий.
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  // Функция-переводчик для локализации сообщений.
  t: Translator
  // Настройки автосохранения.
  preferencesLoaded: boolean
  autoSaveEnabled: boolean
  autoSaveIntervalMinutes: number
}

// Хук управляет всеми файловыми операциями сцены:
// экспорт катсцены, сохранение/SaveAs, автосохранение,
// открытие существующей сцены, создание новой/примера.
export function useSceneIO(deps: UseSceneIODeps) {
  const {
    runtime,
    runtimeRef,
    setRuntime,
    validation,
    sceneFilePath,
    setSceneFilePath,
    toasts,
    confirm,
    t,
    preferencesLoaded,
    autoSaveEnabled,
    autoSaveIntervalMinutes
  } = deps

  // Сериализуем runtime в JSON для сохранения (без editor-only полей selectedNodeId и т.д.).
  const serializeSceneState = (sceneRuntime: RuntimeState): string => {
    return JSON.stringify(
      {
        ...sceneRuntime,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null
      },
      null,
      2
    )
  }

  // Храним последний JSON, который уже ушёл в autosave/manual save.
  // Это защищает от бессмысленной повторной записи одного и того же состояния.
  const lastPersistedSceneJsonRef = useRef<string | null>(null)

  // Экспорт катсцены: валидация → компиляция → JSON → сохранение через IPC.
  const handleExport = useCallback(async () => {
    const val = validation
    if (val.hasErrors) {
      const errorCount = val.entries.filter((e) => e.severity === 'error').length
      pushError(toasts, t('dialog.exportBlockedMessage', { count: errorCount }, 'Fix {count} error(s) before exporting.'), {
        title: t('dialog.exportBlockedTitle', 'Export blocked'),
        duration: 0
      })
      return
    }

    const result = compileGraph(runtime, t)
    if (!result.ok) {
      pushError(toasts, result.error, { title: t('dialog.exportFailedTitle', 'Export failed'), duration: 0 })
      return
    }
    const exported = stripExport(runtime, result.actions)
    const jsonString = JSON.stringify(exported, null, 2)

    if (!window.api?.export) {
      console.warn('Export API not available')
      return
    }

    const saveResult = (await window.api.export.save(jsonString)) as {
      saved: boolean
      filePath?: string
    }
    if (saveResult.saved) {
      pushSuccess(toasts, saveResult.filePath ?? '', { title: t('toasts.exported', 'Exported') })
    }
  }, [validation, runtime, toasts, t])

  // Save As: показываем диалог выбора файла, сохраняем, запоминаем путь.
  // Используем runtimeRef.current вместо runtime, чтобы не зависеть от runtime в deps.
  const handleSaveAs = useCallback(async () => {
    if (!window.api?.scene) {
      console.warn('Scene API not available')
      return
    }

    const jsonString = serializeSceneState(runtimeRef.current)
    const result = (await window.api.scene.saveAs(jsonString)) as {
      saved: boolean
      filePath?: string
    }
    if (result.saved && result.filePath) {
      lastPersistedSceneJsonRef.current = jsonString
      setSceneFilePath(result.filePath)
    }
  }, [toasts, t, setSceneFilePath])

  // Save: если путь известен — сохраняем туда, иначе Save As.
  const handleSave = useCallback(async () => {
    if (!window.api?.scene) {
      console.warn('Scene API not available')
      return
    }

    if (sceneFilePath) {
      const jsonString = serializeSceneState(runtimeRef.current)
      await window.api.scene.save(sceneFilePath, jsonString)
      lastPersistedSceneJsonRef.current = jsonString
    } else {
      await handleSaveAs()
    }
  }, [sceneFilePath, handleSaveAs])

  // Автосохранение по таймеру — пишет в отдельный файл, не мешая ручному Save.
  useEffect(() => {
    if (!preferencesLoaded) return
    if (!autoSaveEnabled) return
    if (!window.api?.scene?.autosave) return

    const intervalMs = Math.max(1, autoSaveIntervalMinutes) * 60 * 1000
    const timer = window.setInterval(() => {
      const jsonString = serializeSceneState(runtimeRef.current)
      if (lastPersistedSceneJsonRef.current === jsonString) return

      window.api.scene
        .autosave(sceneFilePath, jsonString, 5)
        .then(() => {
          lastPersistedSceneJsonRef.current = jsonString
        })
        .catch((err) => {
          console.warn('Failed to autosave scene:', err)
        })
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [
    autoSaveEnabled,
    autoSaveIntervalMinutes,
    preferencesLoaded,
    sceneFilePath
  ])

  // Open Scene: открываем .usc.json / .json файл и загружаем в runtime.
  const handleOpenScene = useCallback(async () => {
    if (!window.api?.scene) {
      console.warn('Scene API not available')
      return
    }

    const confirmed = await confirm({
      message: t('dialog.openSceneConfirm', 'Switch scene? Unsaved work will be lost.'),
      title: t('dialog.unsavedChangesTitle', 'Unsaved changes'),
      danger: true
    })
    if (!confirmed) return

    const result = (await window.api.scene.open()) as { filePath: string; content: string } | null
    if (!result) return
    try {
      const parsed = JSON.parse(result.content)
      const state = parseRuntimeState(parsed)
      if (state) {
        setRuntime(state)
        setSceneFilePath(result.filePath)
        lastPersistedSceneJsonRef.current = serializeSceneState(state)
      } else {
        const imported = reverseCompileCutscene(parsed)
        if (!imported.ok) {
          pushError(toasts, imported.error, { title: t('alerts.openSceneInvalidFormat', 'Open failed'), duration: 0 })
          return
        }
        setRuntime(imported.state)
        setSceneFilePath(null)
        lastPersistedSceneJsonRef.current = null
        if (imported.warnings.length > 0) {
          imported.warnings.forEach((w) => pushWarning(toasts, w))
        }
      }
    } catch {
      pushError(toasts, t('alerts.openSceneInvalidJson', 'File corrupted (invalid JSON).'), { title: t('alerts.openFailedTitle', 'Open failed'), duration: 0 })
    }
  }, [setRuntime, setSceneFilePath, confirm, t, toasts])

  // New Scene: сбрасываем runtime в начальное состояние.
  const handleNew = useCallback(async () => {
    const confirmed = await confirm({
      message: t('dialog.newSceneConfirm', 'New scene? Unsaved work will be lost.'),
      title: t('dialog.unsavedChangesTitle', 'Unsaved changes'),
      danger: true
    })
    if (!confirmed) return
    setRuntime(createEmptyRuntimeState())
    setSceneFilePath(null)
    lastPersistedSceneJsonRef.current = null
  }, [setRuntime, setSceneFilePath, confirm, t, toasts])

  // Create Example: загружаем демонстрационную сцену с готовым графом.
  const handleCreateExample = useCallback(async () => {
    const confirmed = await confirm({
      message: t('dialog.exampleSceneConfirm', 'Load example? Unsaved work will be lost.'),
      title: t('dialog.unsavedChangesTitle', 'Unsaved changes'),
      danger: true
    })
    if (!confirmed) return
    setRuntime(createDefaultRuntimeState())
    setSceneFilePath(null)
    lastPersistedSceneJsonRef.current = null
  }, [setRuntime, setSceneFilePath, confirm, t, toasts])

  // Ref на save/new/export — нужны, чтобы горячие клавиши могли вызвать эти функции.
  const saveRef = useRef<(() => void) | null>(null)
  saveRef.current = handleSave
  const newRef = useRef<(() => void) | null>(null)
  newRef.current = handleNew
  const exportRef = useRef<(() => void) | null>(null)
  exportRef.current = handleExport

  return {
    handleExport,
    handleSave,
    handleSaveAs,
    handleOpenScene,
    handleNew,
    handleCreateExample,
    saveRef,
    newRef,
    exportRef
  }
}
