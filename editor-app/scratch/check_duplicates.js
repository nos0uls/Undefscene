const fs = require('fs')

function checkFile(path) {
  const content = fs.readFileSync(path, 'utf8')
  const lines = content.split('\n')
  const keys = new Set()
  const duplicates = []

  // Simple regex to match keys inside objects
  const keyRegex = /^\s+([a-zA-Z0-9_]+):/i

  let inObject = false
  let objectStack = []

  lines.forEach((line, i) => {
    const match = line.match(keyRegex)
    if (match) {
      const key = match[1]
      // We only care about top-level keys within the main export object for now
      // as nested ones might be legitimate (e.g. 'title' in different sections)
      // But the error was about duplicate keys in the same object literal.
      // In our case, 'editor' object has a lot of keys.
    }
  })

  // Actually, let's just find lines that look like key definitions and see if they repeat
  // within the same indentation level / block.
}

// simpler approach: grep for all keys and see if any are defined twice in the same file
// but only if they are at the same indentation.
