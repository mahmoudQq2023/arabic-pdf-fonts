# arabic-pdf-fonts

**Which Arabic fonts produce a searchable PDF when you print HTML with Chrome?**
Almost none. This repo has the test, the results, and a one-command checker for your own font.

If you generate Arabic invoices, contracts, certificates or CVs with Puppeteer, Playwright,
headless Chrome or any HTML-to-PDF service built on them, the PDF can look perfect and still
contain no usable text: copy-paste gives garbage, `Ctrl+F` finds nothing, and an ATS or a
document search index reads noise. Nothing on screen tells you.

## Results (headless Chrome 135, pdf.js 4.8, September 2026)

| Font | Letters stored as | لا / لأ / لإ ligature | Whole words searchable |
|---|---|---|---|
| **Amiri** Regular | real Arabic letters | in order | 15 / 18 |
| **Amiri** Bold | real Arabic letters | in order | 16 / 18 |
| IBM Plex Sans Arabic | presentation forms | — | 0 / 18 |
| Noto Sans Arabic | presentation forms | — | 0 / 18 |
| Arial (Windows) | presentation forms | — | 0 / 18 |
| Tahoma (Windows) | presentation forms | — | 0 / 18 |
| Times New Roman (Windows) | presentation forms | — | 0 / 18 |
| Segoe UI (Windows) | presentation forms | — | 1 / 18 |
| Traditional Arabic (Windows) | presentation forms | — | 0 / 18 |
| Simplified Arabic (Windows) | presentation forms | — | 0 / 18 |
| Arabic Typesetting (Windows) | presentation forms | — | 0 / 18 |
| Sakkal Majalla (Windows) | presentation forms | — | 1 / 18 |
| Andalus (Windows) | presentation forms | — | 0 / 18 |

An earlier round (August 2026, same method) also tested web fonts that are not in this run:

| Font | Result |
|---|---|
| Readex Pro, Scheherazade New, Lateef | real letters, but the lam-alef ligature comes back **reversed**, so الأمر / الآن / لإدارة are not found |
| Noto Naskh Arabic, Noto Kufi Arabic, Cairo, Almarai, Tajawal | presentation forms |

**Amiri was the only face where both checks passed.** The missing 2–3 words are not a
font problem: pdf.js sometimes inserts a space inside a word at a text-run boundary, so a
literal search for that one word can miss while its letters are all present and in order.

## Why it happens

Arabic letters change shape by position (isolated, initial, medial, final) and some pairs
fuse into one glyph (لا). Chrome shapes the text with HarfBuzz and embeds the font's glyphs
in the PDF. To make the text extractable it also writes a `ToUnicode` map: glyph → the
characters it came from. For most Arabic fonts Chrome cannot trace the shaped glyph back to
the original letter, so the map points at the **Unicode presentation-form** codepoints
(U+FB50–FDFF, U+FE70–FEFF) that describe the shape instead of the letter. The page renders
correctly; the text layer is a different string from the one you typed.

The lam-alef ligature is the second trap. It is one glyph for two letters. Most faces that
get the letters right still map that glyph back as alef + lam, reversed, which breaks every
word with ال followed by أ/إ/آ — a large share of Arabic words.

## Check your own font

```bash
git clone https://github.com/mahmoudQq2023/arabic-pdf-fonts
cd arabic-pdf-fonts
npm install
node check-font.mjs /path/to/YourFont-Regular.ttf /path/to/Another.otf
```

Output, one line per font:

```
Amiri-Regular.ttf        OK: real letters, lam-alef in order  (15/18 words searchable)
tahoma.ttf               BROKEN: presentation forms (text not searchable)  (0/18 words searchable)
```

`--json` prints machine-readable results; `CHROME_PATH=/usr/bin/google-chrome` uses a
specific Chrome. The exit code is non-zero if any font fails, so it can run in CI next to
your PDF templates.

## What to do about it

- **Embed Amiri** (SIL Open Font License) for any Arabic text that has to stay searchable,
  including the bold weight: a synthetic bold draws each glyph separately and can split a
  bold heading into one run per letter.
- **Do not promise copyable harakat.** Diacritics (U+064B–0652) render in every face but
  extracted as U+0000 in all of them in our runs.
- **Test the output, not the page.** Run the checker, or open the PDF and search for a word
  that contains لا, before you ship a template.

If you only need the result and not the code, [Confileo's text to PDF converter](https://confileo.com/tools/text-to-pdf/)
embeds Amiri for this reason, and the Arabic version is at
[تحويل النص إلى PDF](https://confileo.com/ar/nass-ila-pdf/). Both came out of the same
measurement.

## Licence

MIT for the code. Fonts are not included; use your own files.
