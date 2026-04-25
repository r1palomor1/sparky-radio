import os

file_path = r'c:\Users\palom\Vibe Coding Apps\Radio Internet Claude\sparky-radio\index.html.staging'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """.filter-label {
      font-size: calc(8px * var(--text-scale));
      color: var(--dim);
      letter-spacing: 0.5px;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }

"""

replacement = """.filter-label {
      font-size: calc(8px * var(--text-scale));
      color: var(--dim);
      letter-spacing: 0.5px;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .btn-hifi {
      font-size: calc(8px * var(--text-scale));
      background: var(--subdim);
      border: 1px solid var(--border);
      color: var(--dim);
      padding: 2px 8px;
      border-radius: 2px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 700;
      white-space: nowrap;
    }

    .btn-hifi.active {
      background: var(--accent) !important;
      color: #000 !important;
      border-color: var(--accent) !important;
    }

    .preset-label {
      font-size: calc(9px * var(--text-scale));
      color: var(--accent);
      font-weight: 500;
      letter-spacing: 1px;
    }

    .preset-qt-wrap { min-width: 100px; flex-shrink: 1; }
"""

# Also fix the preset-qt-wrap being missing
if '.preset-qt-wrap' not in content:
    content = content.replace('.preset-cl-wrap', replacement + '    .preset-cl-wrap')
else:
    content = content.replace(target, replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fix applied.")
