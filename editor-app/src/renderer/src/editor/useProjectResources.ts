import { useCallback, useEffect, useState } from 'react'

// Список ресурсов из .yyp, который мы будем использовать для autocomplete.
export type ProjectResources = {
  yypPath: string
  projectDir: string
  sprites: string[]
  objects: string[]
  sounds: string[]
  rooms: string[]
  cacheStatus?: 'cold' | 'warm'
  roomScreenshotsDir?: string
  restoredFromLastSession?: boolean
}

// Настройки движка катсцен (whitelists для branch/run_function).
export type EngineSettings = {
  found: boolean
  defaultFps: number
  strictMode: boolean
  defaultActorObject: string
  branchConditions: string[]
  runFunctions: string[]
}

// Информация о .yarn файле: имя файла (без расширения) и список нод внутри.
export type YarnFileInfo = {
  file: string
  nodes: string[]
}

// Хук для загрузки и хранения ресурсов GameMaker проекта + настроек движка + yarn файлов.
export const useProjectResources = (): {
  resources: ProjectResources | null
  engineSettings: EngineSettings | null
  yarnFiles: YarnFileInfo[]
  isLoading: boolean
  openProject: () => Promise<void>
} => {
  const [resources, setResources] = useState<ProjectResources | null>(null)
  const [engineSettings, setEngineSettings] = useState<EngineSettings | null>(null)
  const [yarnFiles, setYarnFiles] = useState<YarnFileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Загружаем связанные данные проекта после успешного открытия/восстановления.
  // Держим это в отдельной функции, чтобы не дублировать логику для open и restore.
  const loadProjectSideData = useCallback(async (res: ProjectResources): Promise<void> => {
    setResources(res)

    // Пытаемся загрузить настройки движка из проекта.
    try {
      const settings = (await window.api.settings.readEngine(res.projectDir)) as EngineSettings
      setEngineSettings(settings)
    } catch {
      // Если не удалось — не страшно, работаем без whitelists.
      setEngineSettings(null)
    }

    // Сканируем .yarn файлы для autocomplete в dialogue нодах.
    try {
      const yarn = (await window.api.yarn.scan(res.projectDir)) as YarnFileInfo[]
      setYarnFiles(yarn)
    } catch {
      setYarnFiles([])
    }
  }, [])

  // Открываем .yyp через IPC и сохраняем ресурсы в состояние.
  // Также пытаемся прочитать cutscene_engine_settings.json и .yarn файлы из datafiles/.
  const openProject = useCallback(async (): Promise<void> => {
    // Проверяем, что мы в Electron-контексте (window.api доступен).
    if (!window.api?.project) {
      console.warn('Project API not available (not in Electron context)')
      return
    }

    setIsLoading(true)
    try {
      const result = await window.api.project.open()
      if (result && typeof result === 'object') {
        await loadProjectSideData(result as ProjectResources)
      }
    } catch (err) {
      console.warn('Failed to open .yyp project:', err)
    } finally {
      setIsLoading(false)
    }
  }, [loadProjectSideData])

  // При запуске пробуем восстановить последний открытый GameMaker project.
  // Это даёт persistence между сессиями даже без ручного File → Open Project.
  useEffect(() => {
    if (!window.api?.project?.restoreLast) return

    let cancelled = false
    setIsLoading(true)

    window.api.project
      .restoreLast()
      .then(async (result) => {
        if (cancelled) return
        if (!result || typeof result !== 'object') return
        await loadProjectSideData(result as ProjectResources)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to restore cached .yyp project:', err)
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadProjectSideData])

  return { resources, engineSettings, yarnFiles, isLoading, openProject }
}
