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

// In some Windows setups, `localhost` may resolve to IPv6 (::1) first.
// Vite might only be listening on IPv4, which can cause ERR_CONNECTION_REFUSED.
// This helper forces an IPv4 URL when we are in dev.
function getDevRendererUrl(): string | undefined {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (!url) return undefined

  return url.replace('localhost', '127.0.0.1')
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

  // HMR for renderer based on electron-vite CLI.
  // Load the remote URL for development or the local html file for production.
  const devUrl = isDev ? getDevRendererUrl() : undefined
  if (devUrl) {
    // If the dev server isn't fully ready yet, Electron can fail the first load.
    // In dev we do a few retries to avoid a crash loop.
    let retryLeft = 20
    mainWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription) => {
      if (retryLeft <= 0) return
      if (
        typeof errorDescription === 'string' &&
        !errorDescription.includes('ERR_CONNECTION_REFUSED')
      ) {
        return
      }

      retryLeft -= 1
      setTimeout(() => {
        mainWindow.loadURL(devUrl)
      }, 250)
    })

    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  const preferencesPath = join(app.getPath('userData'), 'preferences.json')
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
