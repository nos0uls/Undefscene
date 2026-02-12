import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile, writeFile, rename, unlink, readdir } from 'fs/promises'
import { join, dirname, basename } from 'path'
import icon from '../../resources/icon.png?asset'
import { initAutoUpdater } from './updater'

// Simple dev/prod flag.
// We avoid @electron-toolkit/utils here because it can resolve `electron` incorrectly
// in some dev setups and crash before the app starts.
const isDev = !app.isPackaged

// Парсим .yyp и собираем базовые списки ресурсов.
// Это нужно для autocomplete и валидации в инспекторе.
async function parseYypResources(yypPath: string) {
  const projectDir = dirname(yypPath)
  const raw = await readFile(yypPath, 'utf-8')
  // GameMaker .yyp использует нестандартный JSON с trailing commas.
  // Убираем их, чтобы JSON.parse() не падал.
  const cleaned = raw.replace(/,\s*([\]}])/g, '$1')
  const data = JSON.parse(cleaned) as { resources?: Array<{ id?: { name?: string; path?: string } }> }

  const sprites = new Set<string>()
  const objects = new Set<string>()
  const sounds = new Set<string>()
  const rooms = new Set<string>()

  // Пробегаемся по ресурсам .yyp и читаем их .yy файлы.
  for (const res of data.resources ?? []) {
    const resPath = res?.id?.path
    if (!resPath) continue

    const fullPath = join(projectDir, resPath)
    try {
      const resRaw = await readFile(fullPath, 'utf-8')
      // .yy файлы тоже содержат trailing commas.
      const resClean = resRaw.replace(/,\s*([\]}])/g, '$1')
      const resData = JSON.parse(resClean) as { name?: string; resourceType?: string; modelName?: string }
      const resType = resData.resourceType ?? resData.modelName
      const resName = resData.name ?? res.id?.name
      if (!resType || !resName) continue

      if (resType === 'GMSprite') sprites.add(resName)
      if (resType === 'GMObject') objects.add(resName)
      if (resType === 'GMSound') sounds.add(resName)
      if (resType === 'GMRoom') rooms.add(resName)
    } catch (err) {
      // Пропускаем битые/удалённые ресурсы, чтобы не падать.
      continue
    }
  }

  return {
    yypPath,
    projectDir,
    sprites: [...sprites].sort(),
    objects: [...objects].sort(),
    sounds: [...sounds].sort(),
    rooms: [...rooms].sort()
  }
}

// Сканируем datafiles/ на .yarn файлы и извлекаем имена нод.
// Yarn формат: каждая нода начинается с "title: <name>" после "---".
// Возвращаем массив { file: имя файла, nodes: массив имён нод }.
async function scanYarnFiles(projectDir: string): Promise<Array<{ file: string; nodes: string[] }>> {
  const datafilesDir = join(projectDir, 'datafiles')
  let files: string[]
  try {
    const entries = await readdir(datafilesDir)
    files = entries.filter((f) => f.endsWith('.yarn'))
  } catch {
    // Папки datafiles/ нет — это нормально.
    return []
  }

  const result: Array<{ file: string; nodes: string[] }> = []

  for (const file of files) {
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

      result.push({ file: basename(file, '.yarn'), nodes })
    } catch {
      // Битый файл — пропускаем.
      continue
    }
  }

  return result
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
  ipcMain.handle('project.open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open GameMaker Project',
      properties: ['openFile'],
      filters: [{ name: 'GameMaker Project', extensions: ['yyp'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const yypPath = result.filePaths[0]
    try {
      return await parseYypResources(yypPath)
    } catch (err) {
      console.warn('Failed to parse .yyp:', err)
      return null
    }
  })

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
      if (typeof errorDescription === 'string' && !errorDescription.includes('ERR_CONNECTION_REFUSED')) {
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

  ipcMain.handle('layout.read', async () => {
    try {
      const raw = await readFile(layoutPath, 'utf-8')
      return JSON.parse(raw)
    } catch (err: any) {
      // Если файла нет — это не ошибка для пользователя.
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null
      throw err
    }
  })

  ipcMain.handle('runtime.read', async () => {
    try {
      const raw = await readFile(runtimePath, 'utf-8')
      return JSON.parse(raw)
    } catch (err: any) {
      // Если файла нет — это не ошибка для пользователя.
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null
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
    } catch (err: any) {
      // На Windows переименование может падать, если файл уже существует.
      // Тогда удаляем старый файл и пробуем ещё раз.
      if (err && (err.code === 'EEXIST' || err.code === 'EPERM')) {
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
    } catch (err: any) {
      // На Windows переименование может падать, если файл уже существует.
      // Тогда удаляем старый файл и пробуем ещё раз.
      if (err && (err.code === 'EEXIST' || err.code === 'EPERM')) {
        await unlink(layoutPath).catch(() => undefined)
        await rename(layoutTmpPath, layoutPath)
        return
      }
      throw err
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
        strictMode: typeof data.strict_mode_default === 'boolean' ? data.strict_mode_default : false,
        defaultActorObject: typeof data.default_actor_object === 'string' ? data.default_actor_object : '',
        branchConditions: Array.isArray((data.whitelist as any)?.branch_conditions)
          ? (data.whitelist as any).branch_conditions as string[]
          : [],
        runFunctions: Array.isArray((data.whitelist as any)?.run_functions)
          ? (data.whitelist as any).run_functions as string[]
          : []
      }
    } catch {
      // Файл не найден — это нормально, просто возвращаем пустые списки.
      return { found: false, defaultFps: 30, strictMode: false, defaultActorObject: '', branchConditions: [], runFunctions: [] }
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
