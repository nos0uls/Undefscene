import type { RuntimeState } from '../runtimeTypes'
import type { CompiledAction, ExportedCutscene } from './types'

export function stripExport(state: RuntimeState, actions: CompiledAction[]): ExportedCutscene {
  return {
    schema_version: 1,
    cutscene_id:
      state.title
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '') || 'untitled',
    settings: {
      fps: 30
    },
    actions
  }
}
