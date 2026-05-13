/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ValidationResult, ValidationContext } from './validateGraph'
import type { ValidationSeverityOverride } from './validationRuleOverrides'
import { applyOverrides } from './validationRuleOverrides'

export interface EditorValidationReturn {
  validation: ValidationResult
  overriddenEntries: ValidationResult['entries']
  logsData: {
    errorEntries: ValidationResult['entries']
    warnEntries: ValidationResult['entries']
    tipEntries: ValidationResult['entries']
    visibleEntries: ValidationResult['entries']
    severityStyle: Record<string, { color: string; bg: string; icon: string }>
    toggleButtons: Array<{ key: 'errors' | 'warnings' | 'tips'; label: string; count: number; color: string }>
    errorCount: number
    warnCount: number
    tipCount: number
  }
  handleSetRuleOverride: (ruleId: string, severity: ValidationSeverityOverride | 'reset') => void
  handleResetAllOverrides: () => void
}

export function useEditorValidation(
  runtime: { nodes: unknown[]; edges: unknown[]; selectedNodeId: string | null; selectedNodeIds: string[]; selectedEdgeId: string | null },
  validationContext: ValidationContext | undefined,
  ruleOverrides: ValidationSeverityOverride[],
  setRuleOverrides: (overrides: ValidationSeverityOverride[]) => void,
  logsFilters: { errors: boolean; warnings: boolean; tips: boolean },
  preferencesLanguage: string | null,
  t: (key: string, fallback: string) => string
): EditorValidationReturn {
  const [validation, setValidation] = useState<ValidationResult>({ entries: [], hasErrors: false })

  // Lazy-loaded validateGraph function (68KB module)
  const [validateGraphFn, setValidateGraphFn] = useState<((graph: ValidationContext, context: ValidationContext) => ValidationResult) | null>(null)

  // Валидация графа — дорогая операция на больших графах
  useEffect(() => {
    let cancelled = false
    
    const loadAndValidate = async () => {
      if (validateGraphFn) {
        if (!cancelled) {
          const id = setTimeout(() => {
            setValidation(
              validateGraphFn(
                {
                  ...runtime,
                  selectedNodeId: null,
                  selectedNodeIds: [],
                  selectedEdgeId: null
                },
                validationContext
              )
            )
          }, 0)
          return () => clearTimeout(id)
        }
      } else {
        try {
          const module = await import('./validateGraph')
          if (!cancelled) {
            setValidateGraphFn(() => module.validateGraph)
            const id = setTimeout(() => {
              setValidation(
                module.validateGraph(
                  {
                    ...runtime,
                    selectedNodeId: null,
                    selectedNodeIds: [],
                    selectedEdgeId: null
                  },
                  validationContext
                )
              )
            }, 0)
            return () => clearTimeout(id)
          }
        } catch (error) {
          console.error('Failed to load validateGraph module:', error)
        }
      }
    }

    loadAndValidate()

    return () => {
      cancelled = true
    }
  }, [runtime, validationContext, validateGraphFn])

  // Применяем пользовательские переопределения серьёзности к записям валидации
  const overriddenEntries = useMemo(
    () => applyOverrides(validation.entries, ruleOverrides),
    [validation.entries, ruleOverrides]
  )

  // Логи: один проход по validation.entries вместо 4-6 отдельных .filter()
  const logsData = useMemo(() => {
    let errorCount = 0
    let warnCount = 0
    let tipCount = 0
    const errorEntries: ValidationResult['entries'] = []
    const warnEntries: ValidationResult['entries'] = []
    const tipEntries: ValidationResult['entries'] = []
    const visibleEntries: ValidationResult['entries'] = []

    for (let i = 0; i < overriddenEntries.length; i++) {
      const e = overriddenEntries[i]
      if (e.severity === 'error') {
        errorCount++
        errorEntries.push(e)
        if (logsFilters.errors) visibleEntries.push(e)
      } else if (e.severity === 'warn') {
        warnCount++
        warnEntries.push(e)
        if (logsFilters.warnings) visibleEntries.push(e)
      } else if (e.severity === 'tip') {
        tipCount++
        tipEntries.push(e)
        if (logsFilters.tips) visibleEntries.push(e)
      }
    }

    const severityStyle: Record<string, { color: string; bg: string; icon: string }> = {
      error: { color: '#e05050', bg: 'rgba(224,80,80,0.08)', icon: '\u25CF' },
      warn: { color: '#d4a017', bg: 'rgba(212,160,23,0.08)', icon: '\u25CF' },
      tip: { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '\u25CF' }
    }

    const toggleButtons = [
      {
        key: 'errors' as const,
        label: t('logs.errors', 'Errors'),
        count: errorCount,
        color: '#e05050'
      },
      {
        key: 'warnings' as const,
        label: t('logs.warnings', 'Warnings'),
        count: warnCount,
        color: '#d4a017'
      },
      {
        key: 'tips' as const,
        label: t('logs.tips', 'Tips'),
        count: tipCount,
        color: '#58a6ff'
      }
    ]

    return { errorEntries, warnEntries, tipEntries, visibleEntries, severityStyle, toggleButtons, errorCount, warnCount, tipCount }
  }, [overriddenEntries, logsFilters.errors, logsFilters.warnings, logsFilters.tips, preferencesLanguage, t])

  const handleSetRuleOverride = useCallback(
    (ruleId: string, severity: ValidationSeverityOverride | 'reset') => {
      setRuleOverrides((prev) => {
        const next = { ...prev }
        if (severity === 'reset') {
          delete next[ruleId]
        } else {
          next[ruleId] = severity
        }
        return next
      })
    },
    [setRuleOverrides]
  )

  const handleResetAllOverrides = useCallback(() => {
    setRuleOverrides([])
  }, [setRuleOverrides])

  return {
    validation,
    overriddenEntries,
    logsData,
    handleSetRuleOverride,
    handleResetAllOverrides
  }
}
