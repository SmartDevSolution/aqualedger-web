from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
evidence = root / 'docs/ui-evidence/issue-27/rework'
reference = Image.open(root / 'docs/design-references/aqualedger-map-analysis-concept-2026-10-13.png').convert('RGB')
for locale in ('en', 'ar'):
    for width, height in ((1091, 690), (1440, 900)):
        capture = Image.open(evidence / f'{locale}-populated-browser-fixture-{width}x{height}.png').convert('RGB')
        left = reference.resize((round(reference.width * height / reference.height), height))
        result = Image.new('RGB', (left.width + capture.width, height + 32), '#08131f')
        result.paste(left, (0, 32))
        result.paste(capture, (left.width, 32))
        draw = ImageDraw.Draw(result)
        draw.text((12, 10), 'OWNER REFERENCE (decorative bezel is not implementation scope)', fill='white')
        draw.text((left.width + 12, 10), f'{locale.upper()} IMPLEMENTATION - LABELLED BROWSER FIXTURE - {width}x{height}', fill='white')
        result.save(evidence / f'{locale}-reference-comparison-browser-fixture-{width}x{height}.png')
print('Wrote four labelled same-height side-by-side comparisons.')
