import { useState } from 'react'

// Список ресурсов из .yyp, который мы будем использовать для autocomplete.
export type ProjectResources = {
  yypPath: string
  projectDir: string
  sprites: string[]
  objects: string[]
  sounds: string[]
  rooms: string[]
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

// Хук для загрузки и хранения ресурсов GameMaker проекта + настроек движка.
export const useProjectResources = () => {
  const [resources, setResources] = useState<ProjectResources | null>(null)
  const [engineSettings, setEngineSettings] = useState<EngineSettings | null>(null)

  // Открываем .yyp через IPC и сохраняем ресурсы в состояние.
  // Также пытаемся прочитать cutscene_engine_settings.json из datafiles/.
  const openProject = async () => {
    try {
      const result = await window.api.project.open()
      if (result && typeof result === 'object') {
        const res = result as ProjectResources
        setResources(res)

        // Пытаемся загрузить настройки движка из проекта.
        try {
          const settings = await window.api.settings.readEngine(res.projectDir) as EngineSettings
          setEngineSettings(settings)
        } catch {
          // Если не удалось — не страшно, работаем без whitelists.
          setEngineSettings(null)
        }
      }
    } catch (err) {
      console.warn('Failed to open .yyp project:', err)
    }
  }

  return { resources, engineSettings, openProject }
}
