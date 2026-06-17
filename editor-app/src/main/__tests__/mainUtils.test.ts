import { describe, test, expect, vi } from 'vitest'

// Mock Electron before importing index.ts to prevent errors
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('mocked-path'),
    whenReady: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    quit: vi.fn(),
    getAppPath: vi.fn().mockReturnValue('mocked-app-path'),
    setAppUserModelId: vi.fn()
  },
  shell: {
    openExternal: vi.fn()
  },
  BrowserWindow: class {
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    once = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    webContents = {
      setWindowOpenHandler: vi.fn(),
      openDevTools: vi.fn(),
      send: vi.fn()
    }
    isDestroyed = vi.fn().mockReturnValue(false)
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  dialog: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn()
  },
  clipboard: vi.fn(),
  nativeImage: vi.fn()
}))

// Mock updater script
vi.mock('../updater', () => ({
  initAutoUpdater: vi.fn()
}))

// Mock asset import
vi.mock('../../resources/icon.png?asset', () => ({
  default: 'mocked-icon-path'
}))

// Import the functions we want to test
import { sanitizeRoomNameToken, parseRoomScreenshotMeta } from '../index'

describe('main process utils', () => {
  describe('sanitizeRoomNameToken', () => {
    test('sanitizes valid room names correctly', () => {
      expect(sanitizeRoomNameToken('room_level1')).toBe('room_level1')
      expect(sanitizeRoomNameToken('  room_level1  ')).toBe('room_level1')
    })

    test('rejects empty or whitespace-only room names', () => {
      expect(sanitizeRoomNameToken('')).toBe('')
      expect(sanitizeRoomNameToken('   ')).toBe('')
    })

    test('rejects path traversal containing double dots', () => {
      expect(sanitizeRoomNameToken('room/../other')).toBe('')
    })

    test('rejects forbidden characters', () => {
      expect(sanitizeRoomNameToken('room:name')).toBe('')
      expect(sanitizeRoomNameToken('room\\name')).toBe('')
      expect(sanitizeRoomNameToken('room/name')).toBe('')
      expect(sanitizeRoomNameToken('room*name')).toBe('')
      expect(sanitizeRoomNameToken('room?name')).toBe('')
      expect(sanitizeRoomNameToken('room"name')).toBe('')
      expect(sanitizeRoomNameToken('room<name')).toBe('')
      expect(sanitizeRoomNameToken('room>name')).toBe('')
      expect(sanitizeRoomNameToken('room|name')).toBe('')
      expect(sanitizeRoomNameToken('room\x05name')).toBe('')
    })
  })

  describe('parseRoomScreenshotMeta', () => {
    test('parses valid metadata JSON correctly', () => {
      const validJson = JSON.stringify({
        room_name: 'room_start',
        file_prefix: 'prefix_',
        naming: 'naming_conv',
        room_width: 1920,
        room_height: 1080,
        capture_width: 960,
        capture_height: 540,
        rows: 2,
        cols: 2
      })

      const result = parseRoomScreenshotMeta(validJson)
      expect(result).not.toBeNull()
      if (result) {
        expect(result.room_name).toBe('room_start')
        expect(result.room_width).toBe(1920)
        expect(result.rows).toBe(2)
      }
    })

    test('returns null for invalid JSON', () => {
      expect(parseRoomScreenshotMeta('{invalid-json}')).toBeNull()
    })

    test('returns null if required string fields are missing or empty', () => {
      const missingName = JSON.stringify({
        file_prefix: 'prefix_',
        naming: 'naming_conv',
        room_width: 1920,
        room_height: 1080,
        capture_width: 960,
        capture_height: 540,
        rows: 2,
        cols: 2
      })
      expect(parseRoomScreenshotMeta(missingName)).toBeNull()

      const emptyName = JSON.stringify({
        room_name: '  ',
        file_prefix: 'prefix_',
        naming: 'naming_conv',
        room_width: 1920,
        room_height: 1080,
        capture_width: 960,
        capture_height: 540,
        rows: 2,
        cols: 2
      })
      expect(parseRoomScreenshotMeta(emptyName)).toBeNull()
    })

    test('returns null if any numeric field is missing or non-finite', () => {
      const missingWidth = JSON.stringify({
        room_name: 'room_start',
        file_prefix: 'prefix_',
        naming: 'naming_conv',
        room_height: 1080,
        capture_width: 960,
        capture_height: 540,
        rows: 2,
        cols: 2
      })
      expect(parseRoomScreenshotMeta(missingWidth)).toBeNull()

      const infiniteWidth = JSON.stringify({
        room_name: 'room_start',
        file_prefix: 'prefix_',
        naming: 'naming_conv',
        room_width: Infinity,
        room_height: 1080,
        capture_width: 960,
        capture_height: 540,
        rows: 2,
        cols: 2
      })
      expect(parseRoomScreenshotMeta(infiniteWidth)).toBeNull()
    })
  })
})
