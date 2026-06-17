import type { SupportedLanguage } from '../../i18n/index'

export type ValidationContext = {
  language?: SupportedLanguage
  objects?: string[]
  sprites?: string[]
  sounds?: string[]
  yarnFiles?: Map<string, string[]>
  runFunctions?: string[]
  branchConditions?: string[]
}

export type ValidationSeverity = 'error' | 'warn' | 'tip'

export type ValidationEntry = {
  ruleId?: string
  severity: ValidationSeverity
  defaultSeverity?: ValidationSeverity
  nodeId?: string
  edgeId?: string
  message: string
}

export type ValidationResult = {
  entries: ValidationEntry[]
  hasErrors: boolean
}
