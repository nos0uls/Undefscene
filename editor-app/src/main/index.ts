import { app, shell, BrowserWindow, ipcMain, dialog, Menu, clipboard, nativeImage } from 'electron'
import { readFileSync } from 'fs'
import {
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  copyFile,
  mkdir,
  appendFile,
  stat
} from 'fs/promises'
import { join, dirname, basename, extname, relative, resolve, sep } from 'path'
import icon from '../../resources/icon.png?asset'
import { initAutoUpdater } from './updater'

// Simple dev/prod flag.
// We avoid @electron-toolkit/utils here because it can resolve `electron` incorrectly
// in some dev setups and crash before the app starts.
const isDev = !app.isPackaged

// Минимальный bridge-state для отдельного native окна Visual Editing.
// Main хранит последний snapshot и маршрутизирует его между окнами через IPC.
type VisualEditorBridgeState = {
  rooms: string[]
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  visualEditorTechMode: boolean
  selectedNode: {
    id: string
    type: string
    name?: string
  } | null
  selectedActorTarget: string | null
  selectedPathPoints: Array<{ x: number; y: number }>
  actorPreviews: Array<{
    id: string
    key: string
    x: number
    y: number
    spriteOrObject: string
    isVirtual?: boolean
  }>
  language: 'en' | 'ru'
}

// Минимальные данные sprite preview для actor overlay в Visual Editing.
// Храним уже готовый data URL и размеры кадра, чтобы renderer ничего не читал с диска.
type ActorSpritePreview = {
  dataUrl: string
  width: number
  height: number
  xorigin: number
  yorigin: number
  resourceName: string
  resourceKind: 'sprite' | 'object'
}

// Ссылки на главное окно редактора и отдельное окно visual editing.
// Они нужны для focus/open и для обратной доставки import path в EditorShell.
let mainWindowRef: BrowserWindow | null = null
let visualEditorWindowRef: BrowserWindow | null = null
let latestVisualEditorState: VisualEditorBridgeState | null = null

// Лог-файлы приложения в userData.
// Используем простую ротацию: undefscene.log, undefscene.log.1, undefscene.log.2
// Максимум 3 файла по ~1MB каждый.
const LOG_FILE_NAME = 'undefscene.log'
const LOG_MAX_BYTES = 1024 * 1024
const LOG_ROTATION_COUNT = 3

// Безопасно превращаем любые console args в одну строку для файла логов.
function stringifyLogPart(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

// Возвращает абсолютный путь к лог-файлу по индексу ротации.
function getLogPath(index = 0): string {
  const base = join(app.getPath('userData'), LOG_FILE_NAME)
  return index === 0 ? base : `${base}.${index}`
}

// Ротация логов при превышении лимита размера.
async function rotateLogsIfNeeded(): Promise<void> {
  try {
    const currentStat = await stat(getLogPath(0))
    if (currentStat.size < LOG_MAX_BYTES) return
  } catch {
    return
  }

  for (let index = LOG_ROTATION_COUNT - 1; index >= 1; index -= 1) {
    const sourcePath = getLogPath(index - 1)
    const targetPath = getLogPath(index)

    try {
      await unlink(targetPath)
    } catch {
      // Старый rotated-файл может отсутствовать — это нормально.
    }

    try {
      await rename(sourcePath, targetPath)
    } catch {
      // Если source ещё не существует — просто пропускаем.
    }
  }
}

// Записываем строку в лог-файл и при необходимости крутим ротацию.
async function writeLogLine(level: 'log' | 'warn' | 'error', parts: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level.toUpperCase()}] ${parts.map(stringifyLogPart).join(' ')}\n`

  try {
    await rotateLogsIfNeeded()
    await appendFile(getLogPath(0), line, 'utf-8')
  } catch {
    // Никогда не валим приложение из-за ошибок логгера.
  }
}

// Включаем запись console.log/warn/error в файл.
function installFileLogger(): void {
  const originalLog = console.log.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  console.log = (...parts: unknown[]) => {
    originalLog(...parts)
    void writeLogLine('log', parts)
  }

  console.warn = (...parts: unknown[]) => {
    originalWarn(...parts)
    void writeLogLine('warn', parts)
  }

  console.error = (...parts: unknown[]) => {
    originalError(...parts)
    void writeLogLine('error', parts)
  }

  process.on('uncaughtException', (error) => {
    originalError(error)
    void writeLogLine('error', ['uncaughtException', error])
  })

  process.on('unhandledRejection', (reason) => {
    originalError(reason)
    void writeLogLine('error', ['unhandledRejection', reason])
  })
}

installFileLogger()

// Читаем preferences.json как можно раньше.
// Это нужно для флага disableHardwareAcceleration, который Electron должен получить
// ещё до ready/createWindow, иначе настройка не применится на текущем запуске.
try {
  const earlyPreferencesPath = join(app.getPath('userData'), 'preferences.json')
  const earlyRaw = readFileSync(earlyPreferencesPath, 'utf-8')
  const earlyPrefs = JSON.parse(earlyRaw) as { disableHardwareAcceleration?: unknown }

  if (earlyPrefs?.disableHardwareAcceleration === true) {
    app.disableHardwareAcceleration()
  }
} catch {
  // Если preferences.json ещё нет или он битый, просто используем дефолтный режим.
}

// Парсим .yyp и собираем базовые списки ресурсов.
// Это нужно для autocomplete и валидации в инспекторе.
async function parseYypResources(yypPath: string): Promise<{
  yypPath: string
  projectDir: string
  sprites: string[]
  objects: string[]
  sounds: string[]
  rooms: string[]
}> {
  const projectDir = dirname(yypPath)
  const raw = await readFile(yypPath, 'utf-8')
  // GameMaker .yyp использует нестандартный JSON с trailing commas.
  // Убираем их, чтобы JSON.parse() не падал.
  const cleaned = raw.replace(/,\s*([\]}])/g, '$1')
  const data = JSON.parse(cleaned) as {
    resources?: Array<{ id?: { name?: string; path?: string } }>
  }

  const sprites = new Set<string>()
  const objects = new Set<string>()
  const sounds = new Set<string>()
  const rooms = new Set<string>()

  // Пробегаемся по ресурсам .yyp и читаем их .yy файлы параллельно.
  const resourcePromises = (data.resources ?? []).map(async (res) => {
    const resPath = res?.id?.path
    if (!resPath) return

    const fullPath = join(projectDir, resPath)
    try {
      const resRaw = await readFile(fullPath, 'utf-8')
      // .yy файлы тоже содержат trailing commas.
      const resClean = resRaw.replace(/,\s*([\]}])/g, '$1')
      const resData = JSON.parse(resClean) as {
        name?: string
        resourceType?: string
        modelName?: string
      }
      const resType = resData.resourceType ?? resData.modelName
      const resName = resData.name ?? res.id?.name
      if (!resType || !resName) return

      if (resType === 'GMSprite') sprites.add(resName)
      if (resType === 'GMObject') objects.add(resName)
      if (resType === 'GMSound') sounds.add(resName)
      if (resType === 'GMRoom') rooms.add(resName)
    } catch {
      // Пропускаем битые/удалённые ресурсы, чтобы не падать.
    }
  })

  await Promise.all(resourcePromises)

  return {
    yypPath,
    projectDir,
    sprites: [...sprites].sort(),
    objects: [...objects].sort(),
    sounds: [...sounds].sort(),
    rooms: [...rooms].sort()
  }
}

type ProjectResources = Awaited<ReturnType<typeof parseYypResources>> & {
  cacheStatus?: 'cold' | 'warm'
  roomScreenshotsDir?: string
  restoredFromLastSession?: boolean
}

type ProjectResourcesCacheFile = {
  schemaVersion: 1
  yypPath: string
  yypMtimeMs: number
  resources: Awaited<ReturnType<typeof parseYypResources>>
}

// Нормализуем имя проекта для userData cache-папки.
// Это позволяет хранить отдельный cache и screenshots для каждого .yyp.
function getProjectCacheKey(yypPath: string): string {
  const stem = basename(yypPath, extname(yypPath)) || 'project'
  return stem.replace(/[^a-z0-9._-]+/gi, '_')
}

// Возвращаем корневую папку cache для конкретного .yyp проекта.
function getProjectCacheDir(yypPath: string): string {
  return join(app.getPath('userData'), 'project-cache', getProjectCacheKey(yypPath))
}

// Файл с сериализованными ресурсами .yyp.
function getProjectResourcesCachePath(yypPath: string): string {
  return join(getProjectCacheDir(yypPath), 'resources.json')
}

// Папка для room screenshots.
// Пока мы только гарантируем её существование между сессиями.
function getProjectRoomScreenshotsDir(yypPath: string): string {
  return join(getProjectCacheDir(yypPath), 'room-screenshots')
}

// Файл с путём к последнему открытому проекту.
function getLastProjectPathCacheFile(): string {
  return join(app.getPath('userData'), 'last-project.json')
}

// Путь к preferences.json держим отдельным helper'ом,
// чтобы screenshot search и IPC читали один источник правды.
function getPreferencesPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

// Читаем только screenshot-related preferences из userData.
// Если файла ещё нет или поле не задано, спокойно падаем обратно на null.
async function readScreenshotPreferences(): Promise<ScreenshotPreferencesSnapshot> {
  try {
    const raw = await readFile(getPreferencesPath(), 'utf-8')
    const parsed = JSON.parse(raw) as ScreenshotPreferencesSnapshot
    return {
      screenshotOutputDir:
        typeof parsed?.screenshotOutputDir === 'string' ? parsed.screenshotOutputDir : null
    }
  } catch {
    return { screenshotOutputDir: null }
  }
}

// Читаем ресурсы проекта из cache, если cache ещё валиден по mtime .yyp.
async function readCachedProjectResources(yypPath: string): Promise<ProjectResources | null> {
  const cachePath = getProjectResourcesCachePath(yypPath)
  const screenshotsDir = getProjectRoomScreenshotsDir(yypPath)

  try {
    const [cacheRaw, yypStat] = await Promise.all([readFile(cachePath, 'utf-8'), stat(yypPath)])
    const parsed = JSON.parse(cacheRaw) as Partial<ProjectResourcesCacheFile>

    if (
      parsed?.schemaVersion !== 1 ||
      parsed?.yypPath !== yypPath ||
      typeof parsed?.yypMtimeMs !== 'number' ||
      !parsed?.resources ||
      parsed.yypMtimeMs !== yypStat.mtimeMs
    ) {
      return null
    }

    await mkdir(screenshotsDir, { recursive: true })

    return {
      ...parsed.resources,
      cacheStatus: 'warm',
      roomScreenshotsDir: screenshotsDir
    }
  } catch {
    return null
  }
}

// Сохраняем ресурсы проекта в cache рядом с его screenshot-папкой.
async function writeCachedProjectResources(
  yypPath: string,
  resources: Awaited<ReturnType<typeof parseYypResources>>
): Promise<void> {
  const cacheDir = getProjectCacheDir(yypPath)
  const cachePath = getProjectResourcesCachePath(yypPath)
  const screenshotsDir = getProjectRoomScreenshotsDir(yypPath)
  const yypStat = await stat(yypPath)

  await mkdir(cacheDir, { recursive: true })
  await mkdir(screenshotsDir, { recursive: true })

  const payload: ProjectResourcesCacheFile = {
    schemaVersion: 1,
    yypPath,
    yypMtimeMs: yypStat.mtimeMs,
    resources
  }

  await writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf-8')
}

// Запоминаем путь к последнему успешно открытому GameMaker project.
async function writeLastOpenedProjectPath(yypPath: string): Promise<void> {
  const filePath = getLastProjectPathCacheFile()
  await writeFile(filePath, JSON.stringify({ schemaVersion: 1, yypPath }, null, 2), 'utf-8')
}

// Возвращаем ресурсы проекта: сначала cache, потом cold parse с записью в cache.
async function resolveProjectResources(
  yypPath: string,
  restoredFromLastSession = false
): Promise<ProjectResources> {
  const cached = await readCachedProjectResources(yypPath)
  if (cached) {
    return {
      ...cached,
      restoredFromLastSession
    }
  }

  const parsed = await parseYypResources(yypPath)
  await writeCachedProjectResources(yypPath, parsed)

  return {
    ...parsed,
    cacheStatus: 'cold',
    roomScreenshotsDir: getProjectRoomScreenshotsDir(yypPath),
    restoredFromLastSession
  }
}

// Рекурсивно собираем все .yarn файлы внутри datafiles/.
// Это нужно, потому что в реальных проектах Yarn часто лежит по подпапкам,
// а не только прямо в корне datafiles/.
async function collectYarnFilesRecursively(
  rootDir: string,
  currentDir: string,
  depthLeft: number
): Promise<string[]> {
  const entries = await readdir(currentDir)

  const promises = entries.map(async (entry) => {
    const fullPath = join(currentDir, entry)

    try {
      const entryStat = await stat(fullPath)
      if (entryStat.isDirectory()) {
        if (depthLeft <= 0) return []
        return collectYarnFilesRecursively(rootDir, fullPath, depthLeft - 1)
      }

      if (entryStat.isFile() && entry.toLowerCase().endsWith('.yarn')) {
        // Храним путь относительно datafiles/, чтобы renderer мог показать подпапки
        // и потом безопасно запросить preview того же файла.
        return [relative(rootDir, fullPath).replace(/\\/g, '/')]
      }
    } catch {
      // Если конкретный файл или подпапка недоступны, просто пропускаем их.
    }
    return []
  })

  const results = await Promise.all(promises)
  return results.flat()
}

// Сканируем datafiles/ на .yarn файлы и извлекаем имена нод.
// Yarn формат: каждая нода начинается с "title: <name>".
// Возвращаем массив { file: относительный путь без .yarn, nodes: массив имён нод }.
async function scanYarnFiles(
  projectDir: string
): Promise<Array<{ file: string; nodes: string[] }>> {
  const datafilesDir = join(projectDir, 'datafiles')
  let files: string[]
  try {
    files = await collectYarnFilesRecursively(datafilesDir, datafilesDir, 3)
  } catch {
    // Папки datafiles/ нет — это нормально.
    return []
  }

  console.log('Yarn scan root:', datafilesDir)
  console.log('Yarn scan found files:', files)

  const resultPromises = files.map(async (file) => {
    try {
      const raw = await readFile(join(datafilesDir, file), 'utf-8')
      const nodes: string[] = []

      // Ищем строки "title: <name>" — это заголовки нод в Yarn Spinner формате.
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('title:')) {
          const name = trimmed.slice('title:'.length).trim()
          if (name) nodes.push(name)
        }
      }

      // Убираем только расширение, но сохраняем относительный путь подпапки.
      return { file: file.replace(/\.yarn$/i, ''), nodes }
    } catch {
      // Битый файл — пропускаем.
      return null
    }
  })

  const results = await Promise.all(resultPromises)
  const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null)

  console.log('Yarn scan parsed entries:', validResults)

  return validResults
}

// Читаем картинку фона canvas из main процесса и превращаем её в data URL.
// Такой формат безопасно работает и в dev-режиме с http renderer, где file:// может блокироваться.
async function readCanvasBackgroundDataUrl(filePath: string): Promise<string | null> {
  const rawPath = String(filePath || '').trim()
  if (!rawPath) return null

  const backgroundsDir = resolve(app.getPath('userData'), 'canvas-backgrounds')
  const resolvedPath = resolve(rawPath)
  if (resolvedPath !== backgroundsDir && !resolvedPath.startsWith(`${backgroundsDir}${sep}`)) {
    return null
  }

  const image = nativeImage.createFromPath(resolvedPath)
  if (image.isEmpty()) return null
  return image.toDataURL()
}

// GameMaker .yy часто содержит trailing commas.
// Убираем их перед JSON.parse, чтобы не падать на валидных для YoYo файлах.
function parseYoYoJson(raw: string): unknown {
  return JSON.parse(raw.replace(/,\s*([\]}])/g, '$1'))
}

// Проверяем, что путь остаётся внутри projectDir.
// Это защищает helper от выхода за пределы открытого проекта.
function isPathInsideProject(projectDir: string, candidatePath: string): boolean {
  const normalizedProjectDir = resolve(projectDir)
  const normalizedCandidatePath = resolve(candidatePath)
  return (
    normalizedCandidatePath === normalizedProjectDir ||
    normalizedCandidatePath.startsWith(`${normalizedProjectDir}${sep}`)
  )
}

// Читаем первый frame sprite preview для указанного sprite или object ресурса.
// Для object сначала резолвим его spriteId, затем читаем sprite.yy и PNG первого кадра.
async function readActorSpritePreview(
  projectDir: string,
  spriteOrObject: string
): Promise<ActorSpritePreview | null> {
  const normalizedProjectDir = String(projectDir || '').trim()
  const normalizedResource = String(spriteOrObject || '').trim()
  if (!normalizedProjectDir || !normalizedResource) {
    return null
  }

  const tryReadSpritePreview = async (
    spriteYyPath: string,
    resourceName: string,
    resourceKind: 'sprite' | 'object'
  ): Promise<ActorSpritePreview | null> => {
    if (!isPathInsideProject(normalizedProjectDir, spriteYyPath)) {
      return null
    }

    const spriteRaw = await readFile(spriteYyPath, 'utf-8')
    const spriteData = parseYoYoJson(spriteRaw) as {
      width?: unknown
      height?: unknown
      frames?: Array<{ name?: unknown }>
      sequence?: { xorigin?: unknown; yorigin?: unknown }
    }

    const firstFrameName = typeof spriteData.frames?.[0]?.name === 'string' ? spriteData.frames[0].name : ''
    if (!firstFrameName) {
      return null
    }

    const framePath = join(dirname(spriteYyPath), `${firstFrameName}.png`)
    if (!isPathInsideProject(normalizedProjectDir, framePath)) {
      return null
    }

    const image = nativeImage.createFromPath(framePath)
    if (image.isEmpty()) {
      return null
    }

    return {
      dataUrl: image.toDataURL(),
      width: typeof spriteData.width === 'number' ? spriteData.width : image.getSize().width,
      height: typeof spriteData.height === 'number' ? spriteData.height : image.getSize().height,
      xorigin:
        typeof spriteData.sequence?.xorigin === 'number' ? spriteData.sequence.xorigin : 0,
      yorigin:
        typeof spriteData.sequence?.yorigin === 'number' ? spriteData.sequence.yorigin : 0,
      resourceName,
      resourceKind
    }
  }

  const directSpriteYyPath = join(
    normalizedProjectDir,
    'sprites',
    normalizedResource,
    `${normalizedResource}.yy`
  )

  try {
    return await tryReadSpritePreview(directSpriteYyPath, normalizedResource, 'sprite')
  } catch {
    // Если это не sprite, пробуем прочитать object.yy ниже.
  }

  const objectYyPath = join(
    normalizedProjectDir,
    'objects',
    normalizedResource,
    `${normalizedResource}.yy`
  )

  if (!isPathInsideProject(normalizedProjectDir, objectYyPath)) {
    return null
  }

  try {
    const objectRaw = await readFile(objectYyPath, 'utf-8')
    const objectData = parseYoYoJson(objectRaw) as {
      spriteId?: { name?: unknown; path?: unknown } | null
    }

    const spriteYyRelativePath =
      typeof objectData.spriteId?.path === 'string' ? objectData.spriteId.path : null
    const spriteName = typeof objectData.spriteId?.name === 'string' ? objectData.spriteId.name : ''
    if (!spriteYyRelativePath || !spriteName) {
      return null
    }

    const spriteYyPath = join(normalizedProjectDir, spriteYyRelativePath)
    return await tryReadSpritePreview(spriteYyPath, spriteName, 'object')
  } catch {
    return null
  }
}

// Meta-файл, который пишет screenshot runner рядом с PNG тайлами.
// Этого формата достаточно, чтобы editor потом stitched whole room image без догадок.
type RoomScreenshotMeta = {
  room_name: string
  file_prefix: string
  room_width: number
  room_height: number
  capture_width: number
  capture_height: number
  rows: number
  cols: number
  naming: string
}

// Один tile, который renderer будет рисовать на canvas.
type RoomScreenshotTilePayload = {
  row: number
  col: number
  fileName: string
  dataUrl: string
}

// Полный пакет данных для visual editing окна.
type RoomScreenshotBundle = {
  roomName: string
  sourceDir: string | null
  searchedDirs: string[]
  cacheKey: string | null
  meta: RoomScreenshotMeta | null
  tiles: RoomScreenshotTilePayload[]
  missingTiles: Array<{ row: number; col: number; fileName: string }>
  warning: string | null
}

// Небольшой in-memory cache для уже прочитанных room screenshot bundles.
// Он экономит повторные nativeImage -> dataURL конверсии при reopen/focus/refresh.
const roomScreenshotBundleCache = new Map<
  string,
  { signature: string; bundle: RoomScreenshotBundle }
>()
const ROOM_SCREENSHOT_BUNDLE_CACHE_LIMIT = 12

// Простая FIFO-очистка cache, чтобы память не росла бесконечно.
function rememberRoomScreenshotBundle(
  cacheIdentity: string,
  signature: string,
  bundle: RoomScreenshotBundle
): void {
  if (roomScreenshotBundleCache.has(cacheIdentity)) {
    roomScreenshotBundleCache.delete(cacheIdentity)
  }

  roomScreenshotBundleCache.set(cacheIdentity, { signature, bundle })

  while (roomScreenshotBundleCache.size > ROOM_SCREENSHOT_BUNDLE_CACHE_LIMIT) {
    const oldestKey = roomScreenshotBundleCache.keys().next().value
    if (!oldestKey) {
      break
    }

    roomScreenshotBundleCache.delete(oldestKey)
  }
}

// Единый helper для bundle-ответа с warning.
// Так IPC остаётся предсказуемым и renderer может показать причину без общего null-fallback.
function createRoomScreenshotWarningBundle(params: {
  roomName: string
  searchedDirs: string[]
  sourceDir?: string | null
  warning: string
}): RoomScreenshotBundle {
  return {
    roomName: params.roomName,
    sourceDir: params.sourceDir ?? null,
    searchedDirs: params.searchedDirs,
    cacheKey: null,
    meta: null,
    tiles: [],
    missingTiles: [],
    warning: params.warning
  }
}

// Минимальный shape preferences.json, который нужен screenshot workflow.
// Здесь intentionally читаем только одно поле, чтобы main не зависел от всего renderer schema.
type ScreenshotPreferencesSnapshot = {
  screenshotOutputDir?: string | null
}

// Нормализуем имя room, чтобы оно не могло увести чтение в произвольный путь.
// GameMaker room names нам не нужно расширенно экранировать — достаточно запретить path separators и control chars.
function sanitizeRoomNameToken(roomName: string): string {
  const raw = String(roomName || '').trim()
  if (!raw) return ''
  if (raw.includes('..')) return ''
  if (/[\\/:*?"<>|\x00-\x1f]/.test(raw)) return ''
  return raw
}

// Индексы row/col в naming convention идут в формате 000.
function padCaptureIndex(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(3, '0')
}

// Проверяем, что JSON действительно похож на наш минимальный screenshot meta contract.
function parseRoomScreenshotMeta(raw: string): RoomScreenshotMeta | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RoomScreenshotMeta>
    if (typeof parsed.room_name !== 'string' || !parsed.room_name.trim()) return null
    if (typeof parsed.file_prefix !== 'string' || !parsed.file_prefix.trim()) return null
    if (typeof parsed.naming !== 'string' || !parsed.naming.trim()) return null

    const numericFields = [
      parsed.room_width,
      parsed.room_height,
      parsed.capture_width,
      parsed.capture_height,
      parsed.rows,
      parsed.cols
    ]
    if (numericFields.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return null
    }

    // После этой проверки значения уже точно numeric,
    // но TypeScript всё ещё держит их как union с undefined.
    // Поэтому поднимаем их в локальные const с явным number-типом.
    const roomWidth = parsed.room_width as number
    const roomHeight = parsed.room_height as number
    const captureWidth = parsed.capture_width as number
    const captureHeight = parsed.capture_height as number
    const rows = parsed.rows as number
    const cols = parsed.cols as number

    return {
      room_name: parsed.room_name,
      file_prefix: parsed.file_prefix,
      room_width: Math.max(1, Math.round(roomWidth)),
      room_height: Math.max(1, Math.round(roomHeight)),
      capture_width: Math.max(1, Math.round(captureWidth)),
      capture_height: Math.max(1, Math.round(captureHeight)),
      rows: Math.max(1, Math.round(rows)),
      cols: Math.max(1, Math.round(cols)),
      naming: parsed.naming
    }
  } catch {
    return null
  }
}

// Собираем все допустимые директории, где editor может искать screenshot output.
// Сначала пробуем явный user override, затем project cache, потом project-local screenshots,
// а в конце fallback на LocalAppData/<project>/screenshots для GameMaker runner'а.
async function getRoomScreenshotSearchDirs(projectDir: string, roomScreenshotsDir?: string | null): Promise<string[]> {
  const result: string[] = []
  const pushUnique = (dirPath: string | null | undefined): void => {
    const normalized = String(dirPath || '').trim()
    if (!normalized) return
    const resolvedDir = resolve(normalized)
    if (!result.includes(resolvedDir)) {
      result.push(resolvedDir)
    }
  }

  const preferences = await readScreenshotPreferences()
  const projectName = basename(resolve(projectDir)) || 'project'
  const localAppDataDir = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, projectName, 'screenshots')
    : null

  pushUnique(preferences.screenshotOutputDir)
  pushUnique(roomScreenshotsDir)
  pushUnique(join(projectDir, 'screenshots'))
  pushUnique(localAppDataDir)
  return result
}

// Ищем первую директорию, где реально лежит room meta.json.
async function findRoomScreenshotMetaLocation(
  projectDir: string,
  roomName: string,
  roomScreenshotsDir?: string | null
): Promise<{ sourceDir: string; metaPath: string } | null> {
  const searchDirs = await getRoomScreenshotSearchDirs(projectDir, roomScreenshotsDir)
  for (const sourceDir of searchDirs) {
    const metaPath = join(sourceDir, `${roomName}-meta.json`)
    try {
      const metaStat = await stat(metaPath)
      if (metaStat.isFile()) {
        return { sourceDir, metaPath }
      }
    } catch {
      // Если meta в этой папке нет, просто переходим к следующему кандидату.
    }
  }

  return null
}

// Возвращаем только те rooms, для которых уже найден валидный meta.json.
// Это помогает не показывать пользователю пустые комнаты в Visual Editing room picker.
async function getAvailableScreenshotRooms(
  projectDir: string,
  roomNames: string[],
  roomScreenshotsDir?: string | null
): Promise<string[]> {
  const result: string[] = []

  for (const roomName of roomNames) {
    const safeRoomName = sanitizeRoomNameToken(roomName)
    if (!safeRoomName) continue

    const metaLocation = await findRoomScreenshotMetaLocation(projectDir, safeRoomName, roomScreenshotsDir)
    if (metaLocation) {
      result.push(safeRoomName)
    }
  }

  return result
}

// Читаем весь room screenshot bundle для visual editing окна.
// Main делает только безопасный file I/O и отдаёт renderer уже удобный пакет данных.
async function readRoomScreenshotBundle(
  projectDir: string,
  roomName: string,
  roomScreenshotsDir?: string | null
): Promise<RoomScreenshotBundle> {
  const safeRoomName = sanitizeRoomNameToken(roomName)
  const searchDirs = await getRoomScreenshotSearchDirs(projectDir, roomScreenshotsDir)
  if (!safeRoomName) {
    return createRoomScreenshotWarningBundle({
      roomName: '',
      searchedDirs: searchDirs,
      warning: 'Invalid room name.'
    })
  }

  const metaLocation = await findRoomScreenshotMetaLocation(projectDir, safeRoomName, roomScreenshotsDir)
  if (!metaLocation) {
    return createRoomScreenshotWarningBundle({
      roomName: safeRoomName,
      searchedDirs: searchDirs,
      warning: 'No room meta JSON found.'
    })
  }

  const [rawMeta, metaStat] = await Promise.all([
    readFile(metaLocation.metaPath, 'utf-8').catch(() => null),
    stat(metaLocation.metaPath).catch(() => null)
  ])
  const meta = rawMeta ? parseRoomScreenshotMeta(rawMeta) : null
  if (!meta) {
    return createRoomScreenshotWarningBundle({
      roomName: safeRoomName,
      sourceDir: metaLocation.sourceDir,
      searchedDirs: searchDirs,
      warning: 'Room meta JSON is missing or invalid.'
    })
  }

  const cacheIdentity = `${resolve(metaLocation.sourceDir)}::${safeRoomName}`

  const tileFileEntries = await Promise.all(
    Array.from({ length: meta.rows * meta.cols }, async (_value, index) => {
      const row = Math.floor(index / meta.cols)
      const col = index % meta.cols
      const fileName = `${meta.file_prefix}-r${padCaptureIndex(row)}-c${padCaptureIndex(col)}.png`
      const filePath = join(metaLocation.sourceDir, fileName)
      try {
        const tileStat = await stat(filePath)
        if (!tileStat.isFile()) {
          return { row, col, fileName, filePath, exists: false, mtimeMs: 0, size: 0 }
        }

        return {
          row,
          col,
          fileName,
          filePath,
          exists: true,
          mtimeMs: tileStat.mtimeMs,
          size: tileStat.size
        }
      } catch {
        return { row, col, fileName, filePath, exists: false, mtimeMs: 0, size: 0 }
      }
    })
  )

  const signature = JSON.stringify({
    sourceDir: resolve(metaLocation.sourceDir),
    metaPath: resolve(metaLocation.metaPath),
    metaMtimeMs: metaStat?.mtimeMs ?? 0,
    metaSize: metaStat?.size ?? 0,
    roomWidth: meta.room_width,
    roomHeight: meta.room_height,
    captureWidth: meta.capture_width,
    captureHeight: meta.capture_height,
    rows: meta.rows,
    cols: meta.cols,
    tiles: tileFileEntries.map((entry) => ({
      row: entry.row,
      col: entry.col,
      fileName: entry.fileName,
      exists: entry.exists,
      mtimeMs: entry.mtimeMs,
      size: entry.size
    }))
  })

  const cached = roomScreenshotBundleCache.get(cacheIdentity)
  if (cached?.signature === signature) {
    return cached.bundle
  }

  const tiles: RoomScreenshotTilePayload[] = []
  const missingTiles: Array<{ row: number; col: number; fileName: string }> = []

  const tilePromises: Promise<void>[] = []
  for (const entry of tileFileEntries) {
    if (!entry.exists) {
      missingTiles.push({ row: entry.row, col: entry.col, fileName: entry.fileName })
      continue
    }

    tilePromises.push(
      Promise.resolve().then(() => {
        const image = nativeImage.createFromPath(entry.filePath)
        if (image.isEmpty()) {
          missingTiles.push({ row: entry.row, col: entry.col, fileName: entry.fileName })
          return
        }

        tiles.push({
          row: entry.row,
          col: entry.col,
          fileName: entry.fileName,
          dataUrl: image.toDataURL()
        })
      })
    )
  }

  await Promise.all(tilePromises)
  tiles.sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))

  const bundle = {
    roomName: safeRoomName,
    sourceDir: metaLocation.sourceDir,
    searchedDirs: searchDirs,
    cacheKey: `${cacheIdentity}::${signature}`,
    meta,
    tiles,
    missingTiles,
    warning: null
  }

  rememberRoomScreenshotBundle(cacheIdentity, signature, bundle)
  return bundle
}

// In some Windows setups, `localhost` may resolve to IPv6 (::1) first.
// Vite might only be listening on IPv4, which can cause ERR_CONNECTION_REFUSED.
// This helper forces an IPv4 URL when we are in dev.
function getDevRendererUrl(): string | undefined {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (!url) return undefined

  return url.replace('localhost', '127.0.0.1')
}

// Собираем URL renderer для конкретного окна.
// Так один renderer bundle может рендерить и main editor, и visual editor окно.
function getRendererUrlForWindow(windowKind: 'main' | 'visual-editor'): string | undefined {
  const baseUrl = getDevRendererUrl()
  if (!baseUrl) return undefined
  if (windowKind === 'main') return baseUrl

  const url = new URL(baseUrl)
  url.searchParams.set('window', windowKind)
  return url.toString()
}

// Общий loader renderer для всех окон.
// В dev повторяем загрузку, если electron-vite сервер ещё не успел подняться.
function loadRendererWindow(targetWindow: BrowserWindow, windowKind: 'main' | 'visual-editor'): void {
  const devUrl = isDev ? getRendererUrlForWindow(windowKind) : undefined
  if (devUrl) {
    let retryLeft = 20
    targetWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription) => {
      if (retryLeft <= 0) return
      if (
        typeof errorDescription === 'string' &&
        !errorDescription.includes('ERR_CONNECTION_REFUSED')
      ) {
        return
      }

      retryLeft -= 1
      setTimeout(() => {
        void targetWindow.loadURL(devUrl)
      }, 250)
    })

    void targetWindow.loadURL(devUrl)
    return
  }

  void targetWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: windowKind === 'main' ? undefined : { window: windowKind }
  })
}

// Создаём отдельное native окно Visual Editing.
// Это окно живёт отдельно в Alt+Tab и получает состояние через IPC bridge.
function createVisualEditorWindow(): BrowserWindow {
  if (visualEditorWindowRef && !visualEditorWindowRef.isDestroyed()) {
    visualEditorWindowRef.focus()
    return visualEditorWindowRef
  }

  const visualWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Undefscene - Visual Editing',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  visualEditorWindowRef = visualWindow

  visualWindow.on('ready-to-show', () => {
    visualWindow.show()
    visualWindow.focus()
    if (latestVisualEditorState) {
      visualWindow.webContents.send('visualEditor.stateUpdated', latestVisualEditorState)
    }
  })

  visualWindow.on('closed', () => {
    if (visualEditorWindowRef === visualWindow) {
      visualEditorWindowRef = null
    }

    latestVisualEditorState = null

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.focus()
      mainWindowRef.webContents.send('visualEditor.windowClosed')
    }
  })

  visualWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(visualWindow, 'visual-editor')
  return visualWindow
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Держим ref на главное окно, чтобы слать туда import path из отдельного visual editor.
  mainWindowRef = mainWindow

  // --- IPC: GameMaker project (.yyp) ---
  // Moved to app.whenReady to avoid duplicate registration on re-create.

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    // Подключаем автообновление.
    // Даже в dev полезно зарегистрировать IPC-хэндлеры, чтобы кнопка "Check for Updates"
    // не "молчала" и могла показать ошибку/статус.
    // Portable сборка устанавливает эту env-переменную.
    const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR
    initAutoUpdater(mainWindow, isPortable)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null
    }

    if (visualEditorWindowRef && !visualEditorWindowRef.isDestroyed()) {
      visualEditorWindowRef.close()
    }
  })

  loadRendererWindow(mainWindow, 'main')
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for Windows notifications/taskbar grouping.
  // In dev we use the current executable path to avoid Windows quirks.
  if (process.platform === 'win32') {
    app.setAppUserModelId(isDev ? process.execPath : 'com.electron')
  }

  // В production убираем нативное меню, чтобы Alt не открывал его.
  // В dev оставляем для удобства (F12 → DevTools).
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  // --- IPC: GameMaker project (.yyp) ---
  ipcMain.handle('project.open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open GameMaker Project',
      properties: ['openFile'],
      filters: [{ name: 'GameMaker Project', extensions: ['yyp'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const yypPath = result.filePaths[0]
    try {
      const resources = await resolveProjectResources(yypPath)
      await writeLastOpenedProjectPath(yypPath)
      return resources
    } catch (err) {
      console.warn('Failed to parse .yyp:', err)
      return null
    }
  })

  // --- IPC: Восстановление последнего GameMaker project между сессиями ---
  ipcMain.handle('project.restoreLast', async () => {
    const cachePath = getLastProjectPathCacheFile()

    try {
      const raw = await readFile(cachePath, 'utf-8')
      const parsed = JSON.parse(raw) as { schemaVersion?: number; yypPath?: string }
      if (parsed?.schemaVersion !== 1 || typeof parsed?.yypPath !== 'string' || !parsed.yypPath) {
        return null
      }

      const yypPath = parsed.yypPath
      await stat(yypPath)

      return await resolveProjectResources(yypPath, true)
    } catch {
      return null
    }
  })

  // IPC: Отдать room screenshot bundle для visual editing окна.
  // Renderer получает уже безопасно прочитанные meta + tiles и не трогает fs напрямую.
  ipcMain.handle(
    'project.availableScreenshotRooms',
    async (_event, projectDir: string, roomNames: string[], roomScreenshotsDir?: string | null) => {
      const normalizedProjectDir = String(projectDir || '').trim()
      if (!normalizedProjectDir) return []

      const normalizedRoomNames = Array.isArray(roomNames)
        ? roomNames.map((roomName) => String(roomName || '').trim()).filter(Boolean)
        : []

      try {
        return await getAvailableScreenshotRooms(normalizedProjectDir, normalizedRoomNames, roomScreenshotsDir)
      } catch (err) {
        console.warn('Failed to collect screenshot rooms:', err)
        return []
      }
    }
  )

  // IPC: Отдать room screenshot bundle для visual editing окна.
  // Renderer получает уже безопасно прочитанные meta + tiles и не трогает fs напрямую.
  ipcMain.handle(
    'project.readRoomScreenshotBundle',
    async (_event, projectDir: string, roomName: string, roomScreenshotsDir?: string | null) => {
      const normalizedProjectDir = String(projectDir || '').trim()
      if (!normalizedProjectDir) {
        return createRoomScreenshotWarningBundle({
          roomName: String(roomName || '').trim(),
          searchedDirs: [],
          warning: 'Project directory is missing.'
        })
      }

      try {
        return await readRoomScreenshotBundle(normalizedProjectDir, roomName, roomScreenshotsDir)
      } catch (err) {
        console.warn('Failed to read room screenshot bundle:', err)
        return createRoomScreenshotWarningBundle({
          roomName: String(roomName || '').trim(),
          searchedDirs: [],
          warning: 'Failed to read room screenshot bundle.'
        })
      }
    }
  )

  // IPC: Отдать sprite preview для actor marker overlay в Visual Editing.
  // Main сам резолвит object -> sprite и читает первый PNG кадр как data URL.
  ipcMain.handle(
    'project.readActorSpritePreview',
    async (_event, projectDir: string, spriteOrObject: string) => {
      const normalizedProjectDir = String(projectDir || '').trim()
      if (!normalizedProjectDir) return null

      try {
        return await readActorSpritePreview(normalizedProjectDir, spriteOrObject)
      } catch (err) {
        console.warn('Failed to read actor sprite preview:', err)
        return null
      }
    }
  )

  // IPC: Открыть отдельное окно Visual Editing и передать ему актуальный snapshot состояния.
  ipcMain.handle('visualEditor.open', async (_event, nextState: VisualEditorBridgeState | null) => {
    latestVisualEditorState = nextState
    const visualWindow = createVisualEditorWindow()
    if (nextState) {
      visualWindow.webContents.send('visualEditor.stateUpdated', nextState)
    }
    return { opened: true }
  })

  // IPC: Обновить snapshot visual editor без повторного открытия окна.
  ipcMain.handle('visualEditor.syncState', async (_event, nextState: VisualEditorBridgeState | null) => {
    latestVisualEditorState = nextState
    if (visualEditorWindowRef && !visualEditorWindowRef.isDestroyed() && nextState) {
      visualEditorWindowRef.webContents.send('visualEditor.stateUpdated', nextState)
    }
    return { synced: true }
  })

  // IPC: Отдать последнюю bridge-state для standalone visual editor renderer.
  ipcMain.handle('visualEditor.getState', async () => {
    return latestVisualEditorState
  })

  // IPC: Импортировать path из отдельного visual editor обратно в главное окно редактора.
  ipcMain.handle(
    'visualEditor.importPath',
    async (_event, points: Array<{ x: number; y: number }> | null | undefined) => {
      const safePoints = Array.isArray(points) ? points : []
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('visualEditor.importPath', safePoints)
        mainWindowRef.focus()
      }
      return { imported: true }
    }
  )

  // IPC: Импортировать actor positions из отдельного visual editor обратно в главное окно редактора.
  // Main здесь только ретранслирует payload в EditorShell, чтобы логика обновления runtime оставалась в одном месте.
  ipcMain.handle(
    'visualEditor.importActors',
    async (
      _event,
      actors:
        | Array<{ id: string; key: string; x: number; y: number; spriteOrObject: string }>
        | null
        | undefined
    ) => {
      const safeActors = Array.isArray(actors) ? actors : []
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('visualEditor.importActors', safeActors)
        mainWindowRef.focus()
      }
      return { imported: true }
    }
  )

  // IPC: Закрыть отдельное окно visual editor по запросу renderer.
  ipcMain.handle('visualEditor.close', async () => {
    if (visualEditorWindowRef && !visualEditorWindowRef.isDestroyed()) {
      visualEditorWindowRef.close()
    }
    return { closed: true }
  })

  // Basic shortcuts.
  // - Dev: F12 toggles DevTools.
  // - Prod: blocks reload/devtools shortcuts.
  app.on('browser-window-created', (_, window) => {
    const { webContents } = window

    webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      if (isDev) {
        if (input.code === 'F12') {
          if (webContents.isDevToolsOpened()) webContents.closeDevTools()
          else webContents.openDevTools({ mode: 'undocked' })
          event.preventDefault()
        }
        return
      }

      // Production: prevent reload and DevTools.
      if (input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
      }
      if (input.code === 'KeyI' && ((input.alt && input.meta) || (input.control && input.shift))) {
        event.preventDefault()
      }
    })
  })

  // --- IPC: Layout persistence ---
  // Сейчас мы сохраняем layout.json в папку userData.
  // Позже мы переключимся на “layout.json per project”, но для первого
  // рабочего прототипа так проще и уже даёт сохранение раскладки.
  const layoutPath = join(app.getPath('userData'), 'layout.json')
  const layoutTmpPath = join(app.getPath('userData'), 'layout.json.tmp')

  // --- IPC: Runtime persistence ---
  // Этот файл хранит состояние runtime-json (узлы, выбранный элемент и т.д.).
  const runtimePath = join(app.getPath('userData'), 'runtime.json')
  const runtimeTmpPath = join(app.getPath('userData'), 'runtime.json.tmp')

  // --- IPC: Preferences persistence ---
  // Настройки редактора (тема, автосохранение, зум и т.д.).
  const preferencesPath = getPreferencesPath()
  const preferencesTmpPath = join(app.getPath('userData'), 'preferences.json.tmp')

  ipcMain.handle('layout.read', async () => {
    try {
      const raw = await readFile(layoutPath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      // Если файла нет — это не ошибка для пользователя.
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') return null
      throw err
    }
  })

  ipcMain.handle('runtime.read', async () => {
    try {
      const raw = await readFile(runtimePath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      // Если файла нет — это не ошибка для пользователя.
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') return null
      throw err
    }
  })

  ipcMain.handle('runtime.write', async (_event, nextRuntime) => {
    // Атомарная запись:
    // 1) пишем во временный файл
    // 2) переименовываем на основной
    const json = JSON.stringify(nextRuntime, null, 2)
    await writeFile(runtimeTmpPath, json, 'utf-8')

    try {
      await rename(runtimeTmpPath, runtimePath)
    } catch (err) {
      // На Windows переименование может падать, если файл уже существует.
      // Тогда удаляем старый файл и пробуем ещё раз.
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EEXIST' || code === 'EPERM') {
        await unlink(runtimePath).catch(() => undefined)
        await rename(runtimeTmpPath, runtimePath)
        return
      }
      throw err
    }
  })

  ipcMain.handle('layout.write', async (_event, nextLayout) => {
    // Атомарная запись:
    // 1) пишем во временный файл
    // 2) переименовываем на основной
    const json = JSON.stringify(nextLayout, null, 2)
    await writeFile(layoutTmpPath, json, 'utf-8')

    try {
      await rename(layoutTmpPath, layoutPath)
    } catch (err) {
      // На Windows переименование может падать, если файл уже существует.
      // Тогда удаляем старый файл и пробуем ещё раз.
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EEXIST' || code === 'EPERM') {
        await unlink(layoutPath).catch(() => undefined)
        await rename(layoutTmpPath, layoutPath)
        return
      }
      throw err
    }
  })

  // --- IPC: Preferences read/write ---
  ipcMain.handle('preferences.read', async () => {
    try {
      const raw = await readFile(preferencesPath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') return null
      throw err
    }
  })

  ipcMain.handle('preferences.write', async (_event, nextPrefs) => {
    const json = JSON.stringify(nextPrefs, null, 2)
    await writeFile(preferencesTmpPath, json, 'utf-8')

    try {
      await rename(preferencesTmpPath, preferencesPath)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EEXIST' || code === 'EPERM') {
        await unlink(preferencesPath).catch(() => undefined)
        await rename(preferencesTmpPath, preferencesPath)
        return
      }
      throw err
    }
  })

  // IPC: Выбрать папку, где editor будет искать PNG/meta от screenshot runner.
  // Это полезно, когда GameMaker пишет output в Local/AppData или другой внешний каталог.
  ipcMain.handle('preferences.chooseScreenshotOutputDir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Screenshot Output Folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // IPC: Выбрать изображение для фона canvas и скопировать его в userData.
  // Это защищает нас от перемещения/удаления исходного файла вне редактора.
  ipcMain.handle('preferences.chooseCanvasBackground', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Canvas Background Image',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
        }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const sourcePath = result.filePaths[0]
    const extension = extname(sourcePath) || '.png'
    const backgroundsDir = join(app.getPath('userData'), 'canvas-backgrounds')
    const targetPath = join(backgroundsDir, `canvas-background${extension}`)

    await mkdir(backgroundsDir, { recursive: true })
    await copyFile(sourcePath, targetPath)

    return targetPath
  })

  // IPC: Прочитать сохранённый canvas background и вернуть data URL для renderer.
  ipcMain.handle('preferences.readCanvasBackgroundDataUrl', async (_event, filePath: string) => {
    try {
      return await readCanvasBackgroundDataUrl(filePath)
    } catch (err) {
      console.warn('Failed to read canvas background data URL:', err)
      return null
    }
  })

  // IPC: Чтение cutscene_engine_settings.json из datafiles/ проекта.
  // Возвращает whitelists для branch conditions и run functions.
  ipcMain.handle('settings.readEngine', async (_event, projectDir: string) => {
    const settingsPath = join(projectDir, 'datafiles', 'cutscene_engine_settings.json')
    try {
      const raw = await readFile(settingsPath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>
      return {
        found: true,
        defaultFps: typeof data.default_fps === 'number' ? data.default_fps : 30,
        strictMode:
          typeof data.strict_mode_default === 'boolean' ? data.strict_mode_default : false,
        defaultActorObject:
          typeof data.default_actor_object === 'string' ? data.default_actor_object : '',
        branchConditions: Array.isArray(
          (data.whitelist as Record<string, unknown>)?.branch_conditions
        )
          ? ((data.whitelist as Record<string, unknown>).branch_conditions as string[])
          : [],
        runFunctions: Array.isArray((data.whitelist as Record<string, unknown>)?.run_functions)
          ? ((data.whitelist as Record<string, unknown>).run_functions as string[])
          : []
      }
    } catch {
      // Файл не найден — это нормально, просто возвращаем пустые списки.
      return {
        found: false,
        defaultFps: 30,
        strictMode: false,
        defaultActorObject: '',
        branchConditions: [],
        runFunctions: []
      }
    }
  })

  // IPC: Сканирование .yarn файлов в datafiles/ проекта.
  // Возвращает массив { file, nodes } для autocomplete в диалоговых нодах.
  ipcMain.handle('yarn.scan', async (_event, projectDir: string) => {
    try {
      return await scanYarnFiles(projectDir)
    } catch {
      return []
    }
  })

  // IPC: Прочитать полный .yarn файл для preview в Text panel.
  ipcMain.handle('yarn.readFile', async (_event, projectDir: string, fileName: string) => {
    const rawName = String(fileName || '').trim().replace(/\\/g, '/')
    if (!rawName) return null
    if (rawName.includes('..')) return null

    const normalizedFile = rawName.endsWith('.yarn') ? rawName : `${rawName}.yarn`
    const datafilesDir = resolve(projectDir, 'datafiles')
    const fullPath = resolve(datafilesDir, normalizedFile)

    // Разрешаем читать только файлы внутри datafiles/.
    // Это сохраняет safe IPC pattern и не даёт выйти в произвольные пути.
    if (fullPath !== datafilesDir && !fullPath.startsWith(`${datafilesDir}${sep}`)) {
      return null
    }

    try {
      return await readFile(fullPath, 'utf-8')
    } catch {
      return null
    }
  })

  // IPC: Экспорт катсцены в JSON-файл для движка.
  ipcMain.handle('export.save', async (_event, jsonString: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Export Cutscene',
      defaultPath: 'cutscene.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) return { saved: false }

    await writeFile(result.filePath, jsonString, 'utf-8')
    return { saved: true, filePath: result.filePath }
  })

  // IPC: Сохранить сцену как... (Save As — показываем диалог выбора файла).
  ipcMain.handle('scene.saveAs', async (_event, jsonString: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Save Scene As',
      defaultPath: 'scene.usc.json',
      filters: [{ name: 'Undefscene', extensions: ['usc.json', 'json'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, jsonString, 'utf-8')
    return { saved: true, filePath: result.filePath }
  })

  // IPC: Сохранить сцену в известный путь (без диалога).
  ipcMain.handle('scene.save', async (_event, filePath: string, jsonString: string) => {
    await writeFile(filePath, jsonString, 'utf-8')
    return { saved: true, filePath }
  })

  // IPC: Автосохранение сцены.
  // Если основной путь уже известен — сохраняем туда же, но сначала делаем autosave-backup
  // с ротацией вида *.autosave-1, *.autosave-2 и т.д.
  // Если путь ещё неизвестен — пишем черновик прямо в userData.
  ipcMain.handle(
    'scene.autosave',
    async (
      _event,
      payload: { filePath?: string | null; jsonString: string; backupCount?: number }
    ) => {
      const jsonString = String(payload?.jsonString ?? '')
      const filePath = typeof payload?.filePath === 'string' ? payload.filePath : null
      const backupCount = Math.max(1, Math.min(20, Number(payload?.backupCount ?? 5)))

      if (filePath) {
        const dir = dirname(filePath)
        const fileName = basename(filePath)
        const fullExt = fileName.endsWith('.usc.json') ? '.usc.json' : extname(fileName) || '.json'
        const stem = fileName.slice(0, Math.max(0, fileName.length - fullExt.length))

        // Сдвигаем существующие autosave-backup вверх по номеру,
        // чтобы autosave-1 всегда был самым свежим backup перед записью нового файла.
        for (let i = backupCount; i >= 1; i -= 1) {
          const backupPath = join(dir, `${stem}.autosave-${i}${fullExt}`)

          if (i === backupCount) {
            await unlink(backupPath).catch(() => undefined)
            continue
          }

          const nextBackupPath = join(dir, `${stem}.autosave-${i + 1}${fullExt}`)
          await rename(backupPath, nextBackupPath).catch(() => undefined)
        }

        // Перед autosave сохраняем предыдущую версию основного файла в autosave-1.
        const existingContent = await readFile(filePath, 'utf-8').catch(() => null)
        if (typeof existingContent === 'string') {
          const backupPath = join(dir, `${stem}.autosave-1${fullExt}`)
          await writeFile(backupPath, existingContent, 'utf-8')
        }

        await writeFile(filePath, jsonString, 'utf-8')
        return { saved: true, filePath }
      }

      // Для несохранённой сцены создаём timestamp-based autosave в userData.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
      const draftPath = join(app.getPath('userData'), `autosave-${stamp}.usc.json`)
      await writeFile(draftPath, jsonString, 'utf-8')
      return { saved: true, filePath: draftPath }
    }
  )

  // IPC: Открыть файл сцены (.usc.json / .json).
  ipcMain.handle('scene.open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Scene',
      filters: [{ name: 'Undefscene', extensions: ['usc.json', 'json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const raw = await readFile(filePath, 'utf-8')
    return { filePath, content: raw }
  })

  // IPC: Отдать базовую информацию о приложении для About modal.
  ipcMain.handle('app.getVersion', () => {
    return app.getVersion()
  })

  // IPC: Открыть внешний URL из renderer безопасным способом через main.
  ipcMain.handle('app.openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // IPC: Открыть DevTools для активного окна по запросу из Help menu.
  ipcMain.handle('app.openDevTools', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    if (!focusedWindow) return
    focusedWindow.webContents.openDevTools({ mode: 'undocked' })
  })

  // IPC: Скопировать последний лог-файл приложения в clipboard.
  ipcMain.handle('app.copyLogToClipboard', async () => {
    try {
      const raw = await readFile(getLogPath(0), 'utf-8')
      clipboard.writeText(raw)
      return { copied: true }
    } catch (err) {
      console.warn('Failed to copy log file to clipboard:', err)
      return { copied: false }
    }
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
