import { describe, test, expect } from 'vitest'
import { parsePreferences, DEFAULT_PREFERENCES } from '../usePreferences'

describe('parsePreferences', () => {
  test('returns null for non-object or null input', () => {
    expect(parsePreferences(null)).toBeNull()
    expect(parsePreferences(undefined)).toBeNull()
    expect(parsePreferences(42)).toBeNull()
    expect(parsePreferences('invalid')).toBeNull()
  })

  test('returns null if schemaVersion mismatch', () => {
    const raw = { schemaVersion: 2 }
    expect(parsePreferences(raw)).toBeNull()
  })

  test('parses correct object and uses fallbacks for missing properties', () => {
    const raw = {
      schemaVersion: 1,
      theme: 'light',
      accentColor: 'cyan'
    }
    const result = parsePreferences(raw)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.theme).toBe('light')
      expect(result.accentColor).toBe('cyan')
      // Fallbacks to default
      expect(result.gridSize).toBe(DEFAULT_PREFERENCES.gridSize)
      expect(result.zoomSpeed).toBe(DEFAULT_PREFERENCES.zoomSpeed)
    }
  })

  test('sanitizes out of bounds grid offsets', () => {
    const raw = {
      schemaVersion: 1,
      visualEditorGridOffsetX: 500, // max is 200
      visualEditorGridOffsetY: -300 // min is -200
    }
    const result = parsePreferences(raw)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.visualEditorGridOffsetX).toBe(DEFAULT_PREFERENCES.visualEditorGridOffsetX)
      expect(result.visualEditorGridOffsetY).toBe(DEFAULT_PREFERENCES.visualEditorGridOffsetY)
    }
  })

  test('sanitizes invalid accentColor and theme to default', () => {
    const raw = {
      schemaVersion: 1,
      theme: 'nonexistent-theme',
      accentColor: 'nonexistent-color'
    }
    const result = parsePreferences(raw)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.theme).toBe(DEFAULT_PREFERENCES.theme)
      expect(result.accentColor).toBe(DEFAULT_PREFERENCES.accentColor)
    }
  })
})
