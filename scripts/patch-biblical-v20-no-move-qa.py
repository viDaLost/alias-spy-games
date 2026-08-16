from pathlib import Path

p = Path('scripts/check-biblical-match-three-visual.mjs')
text = p.read_text()
old = "const first=page.locator('.bmt-v13-level:not([disabled])').first();await first.click();"
new = "const first=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-chapter.is-active .bmt-journey-node:not([disabled]),.bmt-v13-level:not([disabled]):visible').first();await first.scrollIntoViewIfNeeded();await first.click();"
if text.count(old) != 1:
    raise SystemExit(f'expected one no-move level selector, found {text.count(old)}')
p.write_text(text.replace(old, new, 1))
