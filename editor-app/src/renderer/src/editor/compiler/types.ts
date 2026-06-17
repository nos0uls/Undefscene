
export type Translator = (
  key: string,
  fallbackOrParams?: string | Record<string, string | number | undefined>,
  maybeFallback?: string
) => string

export type CompiledAction = {
  type: string
  [key: string]: unknown
}

export type CompileResult = { ok: true; actions: CompiledAction[] } | { ok: false; error: string }

export type ExportedCutscene = {
  schema_version: 1
  cutscene_id: string
  settings: {
    fps: number
  }
  actions: CompiledAction[]
}
