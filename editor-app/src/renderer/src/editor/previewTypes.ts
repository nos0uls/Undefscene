// Команды, которые редактор может отправить в GML-превью.
// Важно: тут НЕ должно быть данных катсцены.
// Катсцена живёт в runtime.json, а preview_control.json — только «сигнал».
export type PreviewCommand =
  | {
      // Просим GML отрендерить текущую комнату/сцену в PNG.
      kind: 'render_room_png'
      params: {
        // Идентификатор комнаты (если нужен). Можно оставить null, если GML сам знает “текущую”.
        roomName: string | null

        // Можно использовать как подсказку имени файла.
        // Например: "cutscene_room_001".
        outNameHint: string | null
      }
    }
  | {
      // Простейшая команда для проверки связи.
      kind: 'ping'
      params: {}
    }

// Тип команды, которую мы отправляем в превью билд.
export type PreviewControl = {
  // Версия схемы для будущих миграций.
  schemaVersion: 1

  // ID запроса. Нужен, чтобы сопоставить команду и результат.
  requestId: string

  // Команда и её параметры.
  command: PreviewCommand

  // Когда команда была отправлена.
  sentAtMs: number
}

// Результат последней выполненной команды.
export type PreviewLastResult = {
  // ID запроса, который мы выполнили.
  requestId: string

  // Какая команда была выполнена.
  kind: PreviewCommand['kind']

  // Путь к PNG, который сгенерировал GML.
  pngPath: string | null
}

// Пути к файлам, через которые редактор общается с GML-превью.
export type PreviewPaths = {
  runtimePath: string
  previewControlPath: string
  previewStatusPath: string
}

// Статус, который отдаёт превью билд обратно в редактор.
export type PreviewStatus = {
  // Версия схемы статуса.
  schemaVersion: 1

  // Состояние превью.
  state: 'idle' | 'working' | 'ok' | 'error'

  // Сообщение для пользователя (например, ошибка или подсказка).
  message: string

  // Время последнего обновления статуса.
  updatedAtMs: number

  // Какой request сейчас выполняется (если выполняется).
  activeRequestId: string | null

  // Результат последней законченной команды (если есть).
  lastResult: PreviewLastResult | null
}

// Генерируем ID запроса.
// В браузере/renderer чаще всего есть crypto.randomUUID(), но делаем запасной вариант.
export const createRequestId = (): string => {
  const cryptoAny = globalThis.crypto as any
  if (cryptoAny && typeof cryptoAny.randomUUID === 'function') {
    return cryptoAny.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// Создаём команду превью.
export const createPreviewControl = (command: PreviewCommand, requestId: string = createRequestId()): PreviewControl => {
  return {
    schemaVersion: 1,
    requestId,
    command,
    sentAtMs: Date.now()
  }
}

// Удобная функция: команда «рендер PNG».
export const createRenderRoomPngControl = (options?: {
  roomName?: string | null
  outNameHint?: string | null
}): PreviewControl => {
  return createPreviewControl({
    kind: 'render_room_png',
    params: {
      roomName: options?.roomName ?? null,
      outNameHint: options?.outNameHint ?? null
    }
  })
}

// Проверяем, что статус похож на ожидаемый формат.
export const parsePreviewStatus = (raw: unknown): PreviewStatus | null => {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<PreviewStatus>

  if (candidate.schemaVersion !== 1) return null
  if (!candidate.state || typeof candidate.state !== 'string') return null
  if (typeof candidate.message !== 'string') return null
  if (typeof candidate.updatedAtMs !== 'number') return null

  if (!['idle', 'working', 'ok', 'error'].includes(candidate.state)) return null

  const activeRequestId = typeof candidate.activeRequestId === 'string' ? candidate.activeRequestId : null

  let lastResult: PreviewLastResult | null = null
  const rawLastResult: any = (candidate as any).lastResult
  if (rawLastResult && typeof rawLastResult === 'object') {
    const requestId = typeof rawLastResult.requestId === 'string' ? rawLastResult.requestId : null
    const kind = typeof rawLastResult.kind === 'string' ? rawLastResult.kind : null
    const pngPath = typeof rawLastResult.pngPath === 'string' ? rawLastResult.pngPath : null

    if (requestId && kind && ['render_room_png', 'ping'].includes(kind)) {
      lastResult = { requestId, kind: kind as PreviewLastResult['kind'], pngPath }
    }
  }

  return {
    schemaVersion: 1,
    state: candidate.state as PreviewStatus['state'],
    message: candidate.message,
    updatedAtMs: candidate.updatedAtMs,
    activeRequestId,
    lastResult
  }
}

// Проверяем, что ответ preview.paths.get похож на ожидаемый формат.
export const parsePreviewPaths = (raw: unknown): PreviewPaths | null => {
  if (!raw || typeof raw !== 'object') return null
  const candidate: any = raw

  if (typeof candidate.runtimePath !== 'string') return null
  if (typeof candidate.previewControlPath !== 'string') return null
  if (typeof candidate.previewStatusPath !== 'string') return null

  return {
    runtimePath: candidate.runtimePath,
    previewControlPath: candidate.previewControlPath,
    previewStatusPath: candidate.previewStatusPath
  }
}
