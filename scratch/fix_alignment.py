import os

file_path = r'c:\Users\palom\Vibe Coding Apps\Radio Internet Claude\sparky-radio\index.html.staging'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """    .pro-header-label {
      justify-self: start;
      font-size: calc(9px * var(--text-scale));
      color: var(--dim);
      letter-spacing: 1.5px;
      font-weight: 500;
      text-transform: uppercase;
      white-space: nowrap;
    }

"""

replacement = """    .pro-header-label {
      justify-self: start;
      font-size: calc(9px * var(--text-scale));
      color: var(--dim);
      letter-spacing: 1.5px;
      font-weight: 500;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .btn-eq-toggle {
      justify-self: end;
    }
"""

content = content.replace(target, replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Alignment fix verified.")
