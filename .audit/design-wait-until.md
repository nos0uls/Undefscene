## Feature: Wait Until

### Problem
Edge condition `wait_until_true` существует, но UX неочевиден — пользователь должен знать, что условие на ребре можно настроить на ожидание. Standalone нода сделает graph читаемее.

### Existing State
- RuntimeEdge: `conditionIfFalse: 'wait_until_true'`, `stopWaitingWhen`, `endTimeoutSeconds`.
- compileGraph создаёт `guard_global` с `if_false: 'wait_until_true'`.
- GML ActionGuardGlobal уже поддерживает `if_false: 'wait_until_true'` и `stop_when: 'timeout'`.

### Proposed Approach (Syntactic Sugar)
Standalone `wait_until` нода — это syntactic sugar для `guard_global` с пустым `actions` массивом. Не требует нового runtime action.

#### Нода `wait_until`
- Category: `logic` (orange)
- Fields:
  - condition_var: text (global variable name, без "global.")
  - condition_equals: text (значение для сравнения)
  - timeout_seconds: number (0 = нет таймаута)
  - on_timeout: select (`continue`, `fail`, default `continue`)

**JSON export (compileGraph):**
```json
{
  "type": "guard_global",
  "var": "door_opened",
  "equals": "true",
  "if_false": "wait_until_true",
  "stop_when": "timeout",
  "end_timeout": 5,
  "actions": []
}
```

Если timeout_seconds = 0, то `stop_when: "none"` (ждать бесконечно).
Если on_timeout = `continue`, то timeout просто позволяет продолжить.
Если on_timeout = `fail`, то... hmm, guard_global не поддерживает fail. Нужно либо:
- Ограничиться `continue` only
- Или добавить логику fail (например, emit warning в GML)

**Recommendation:** MVP с `continue` only. `fail` можно добавить позже.

### Reverse Compile
`guard_global` с `if_false: 'wait_until_true'` и пустыми `actions` → reverse compile в `wait_until` ноду.

### Validation
- `condition_var` не должно быть пустым.
- Если `timeout_seconds` > 0, должно быть числом > 0.
- Предупреждение, если `timeout_seconds` = 0 (потенциально бесконечное ожидание).

### Files To Change
Editor:
1. `nodes/nodeRegistry.ts` — add `wait_until` definition
2. `nodes/CutsceneNodes.tsx` — add React component
3. `nodes/index.ts` — import + mapping
4. `compileGraph.ts` — compile to guard_global with empty actions
5. `reverseCompile.ts` — reverse compile from guard_global
6. `validateGraph.ts` — REQUIRED_PARAMS, validation rules

GML: **NO CHANGES REQUIRED** — uses existing ActionGuardGlobal.

### Risks
- If guard_global `actions` is empty, the cutscene simply continues after condition becomes true or timeout. This is correct behavior.
- Need to ensure that reverseCompile correctly identifies "guard_global with empty actions and wait_until_true" as a `wait_until` node, not as a regular edge condition.

### Verification
- [ ] Editor typecheck/build
- [ ] Export JSON produces correct guard_global
- [ ] Reverse import restores wait_until node
- [ ] Validation catches empty condition_var
- [ ] GML: guard_global with empty actions works as expected
