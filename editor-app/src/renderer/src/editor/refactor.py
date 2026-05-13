import re

# Читаем файл
with open('FlowCanvas.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Удаляем useEffect для keyboard shortcuts (с комментариями и пустыми строками)
# Сначала удалим комментарии
content = re.sub(r'  // Обрабатываем Space прямо внутри холста: вызываем fitView без подъёма\n', '', content)
content = re.sub(r'  // запроса через state/props\. Это предотвращает ре-рендер EditorShell\n', '', content)
content = re.sub(r'  // при каждом нажатии Space на большом графе\.\n', '', content)

# Теперь удалим сам useEffect
pattern = r"""  useEffect\(\(\) => \{\s*const handleKeyDown = \(event: KeyboardEvent\) => \{.*?window\.addEventListener\('keydown', handleKeyDown, true\)\s*return \(\) => window\.removeEventListener\('keydown', handleKeyDown, true\)\s*\}, \[fitView\]\)"""
content = re.sub(pattern, '', content, flags=re.DOTALL)

# Заменяем MiniMap на новый компонент
pattern = r'\{miniMapNodeThreshold !== 0 &&\s*\(miniMapNodeThreshold === -1 \|\| runtimeNodes\.length <= miniMapNodeThreshold\) \? \(\s*<MiniMap[^>]*>\s*pannable\s*zoomable\s*nodeColor="#7ea4ff"\s*nodeStrokeColor="#4a6fcb"\s*nodeBorderRadius=\{2\}\s*nodeStrokeWidth=\{1\}\s*maskColor="rgba\(0, 0, 0, 0\.5\)"\s*maskStrokeColor="rgba\(126, 164, 255, 0\.35\)"\s*maskStrokeWidth=\{1\}\s*style=\{RF_MINIMAP_STYLE\}\s*/>\s*\) : null\}'
replacement = '''<FlowCanvasMiniMap
          miniMapNodeThreshold={miniMapNodeThreshold}
          nodeCount={runtimeNodes.length}
        />'''
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Заменяем Controls на новый компонент
content = content.replace('<Controls showInteractive={false} />', '<FlowCanvasControls />')

# Заменяем Panel с кнопкой на FlowCanvasToolbar
pattern = r'/\* Кнопка создания ноды, вынесенная рядом с Controls в нижний левый угол \*/\s*<Panel position="bottom-left" style=\{RF_FAB_PANEL_STYLE\}>\s*<button\s*className="actionButtonPlus"\s*onClick=\{handleFabAdd\}\s*title=\{t\('editor\.addNodeButtonTitle', 'Add New Node \(Middle Click\)'\)\}\s*aria-label=\{t\('editor\.addNodeAriaLabel', 'Add Node'\)\}>\s*<Plus size=\{18\} strokeWidth=\{2\.5\} />\s*</button>\s*</Panel>'
replacement = '''<FlowCanvasToolbar
          onAddNode={handleFabAdd}
          addButtonTitle={t('editor.addNodeButtonTitle', 'Add New Node (Middle Click)')}
          addNodeAriaLabel={t('editor.addNodeAriaLabel', 'Add Node')}
        />'''
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Добавляем FlowCanvasKeyboardShortcuts после ArrowheadDefs
pattern = r'(<ArrowheadDefs />)'
replacement = r'''\1
        <FlowCanvasKeyboardShortcuts fitView={fitView} />'''
content = re.sub(pattern, replacement, content)

# Записываем файл
with open('FlowCanvas.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('File updated successfully')
