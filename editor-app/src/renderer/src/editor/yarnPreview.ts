// yarnPreview.ts — маленький parser для preview `.yarn` контента в Text panel.
// Нам не нужен полный Yarn AST. Для editor preview достаточно вытащить title и body
// каждой ноды, чтобы пользователь мог быстро посмотреть содержимое файла.

export type ParsedYarnNode = {
  // Имя ноды из `title:`.
  title: string

  // Текстовое тело ноды между `---` и `===`.
  body: string
}

// Парсим содержимое `.yarn` файла в список preview-нод.
// Формат ожидается стандартный Yarn Spinner:
// title: Foo
// ---
// text...
// ===
export function parseYarnPreview(raw: string): ParsedYarnNode[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const nodes: ParsedYarnNode[] = []

  let currentTitle: string | null = null
  let inBody = false
  let bodyLines: string[] = []

  const flushCurrent = (): void => {
    if (!currentTitle) return
    nodes.push({
      title: currentTitle,
      body: bodyLines.join('\n').trim()
    })
    currentTitle = null
    inBody = false
    bodyLines = []
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    // Новая нода начинается с title.
    if (trimmed.startsWith('title:')) {
      flushCurrent()
      currentTitle = trimmed.slice('title:'.length).trim() || 'Untitled'
      continue
    }

    // Разделитель metadata -> body.
    if (trimmed === '---') {
      inBody = true
      continue
    }

    // Разделитель между нодами.
    if (trimmed === '===') {
      flushCurrent()
      continue
    }

    if (inBody && currentTitle) {
      bodyLines.push(rawLine)
    }
  }

  flushCurrent()
  return nodes
}
