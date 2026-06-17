import { describe, test, expect } from 'vitest'
import { parseYarnPreview } from '../yarnPreview'

describe('parseYarnPreview', () => {
  test('parses single yarn node correctly', () => {
    const raw = `title: StartNode
---
Line 1: Hello World
Line 2: How are you?
===`
    const result = parseYarnPreview(raw)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('StartNode')
    expect(result[0].body).toBe('Line 1: Hello World\nLine 2: How are you?')
  })

  test('parses multiple yarn nodes with windows newlines', () => {
    const raw = "title: Node1\r\n---\r\nNode 1 body\r\n===\r\ntitle: Node2\r\n---\r\nNode 2 body\r\n==="
    const result = parseYarnPreview(raw)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Node1')
    expect(result[0].body).toBe('Node 1 body')
    expect(result[1].title).toBe('Node2')
    expect(result[1].body).toBe('Node 2 body')
  })

  test('falls back to Untitled when title is empty', () => {
    const raw = `title:
---
Body text
===`
    const result = parseYarnPreview(raw)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Untitled')
    expect(result[0].body).toBe('Body text')
  })

  test('returns empty array for empty file', () => {
    expect(parseYarnPreview('')).toEqual([])
  })
})
