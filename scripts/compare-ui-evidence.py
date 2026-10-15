from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
evidence = root / 'docs/ui-evidence/issue-27/rework'
reference = Image.open(root / 'docs/design-references/aqualedger-map-analysis-concept-2026-10-13.png').convert('RGB')
count = 0
for locale in ('en', 'ar'):
    for width, height in ((1091, 690), (1440, 900), (390, 844)):
        for state in ('populated', 'empty'):
            capture = Image.open(evidence / f'{locale}-{state}-browser-fixture-{width}x{height}.png').convert('RGB')
            # Identically sized panels: fit the full reference without distortion or crop.
            left = Image.new('RGB', (width, height), '#08131f')
            fitted = reference.copy()
            fitted.thumbnail((width, height))
            left.paste(fitted, ((width - fitted.width) // 2, (height - fitted.height) // 2))
            result = Image.new('RGB', (width * 2, height + 40), '#08131f')
            result.paste(left, (0, 40))
            result.paste(capture, (width, 40))
            draw = ImageDraw.Draw(result)
            draw.text((8, 6), 'OWNER REFERENCE - fitted, no crop', fill='white')
            draw.text((width + 8, 6), f'{locale.upper()} {state.upper()} - BROWSER FIXTURE', fill='white')
            draw.text((width + 8, 22), f'{width}x{height} - NOT real EO acceptance', fill='white')
            result.save(evidence / f'{locale}-{state}-reference-comparison-browser-fixture-{width}x{height}.png')
            count += 1
print(f'Wrote {count} labelled matched-size side-by-side comparisons.')
