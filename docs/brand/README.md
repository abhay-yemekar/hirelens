# Brand

The mark is a **highlight lens**: a lens ring over two faint lines of a resume, with one line highlighted in coral. It is the product's core idea in one picture: every score highlights the resume line that justifies it.

## Colours

| Name  | Hex       | Use                                               |
| ----- | --------- | ------------------------------------------------- |
| Ink   | `#0d1226` | Ring and lines on light backgrounds; tiles        |
| Coral | `#ff6b57` | The highlight, always; the wordmark's second half |
| Cream | `#f7f3ea` | Ring and lines on dark backgrounds                |
| Mist  | `#b6bdd4` | Secondary text on dark backgrounds                |

These match the site's `--hl-ink`, `--hl-accent`, `--hl-cream` and `--hl-mist` tokens.

## Files

| File                  | Use                                                         |
| --------------------- | ----------------------------------------------------------- |
| `mark.svg`            | Full mark on light backgrounds, 20 px and up                |
| `mark-on-dark.svg`    | Full mark on dark backgrounds                               |
| `mark-small.svg`      | 16 px and below: no faint lines, thicker ring and highlight |
| `favicon-tile.svg`    | Source of `apps/web/app/favicon.ico` (16, 32, 48 px)        |
| `apple-icon-tile.svg` | Source of `apps/web/app/apple-icon.png` (180 px)            |
- `apps/web/app/icon.svg` is the small mark with a dark-mode colour switch. It is written by hand, not generated.
- After editing a tile, run `pnpm --filter @hirelens/web run brand-icons` to regenerate the raster icons.
- In the app, use `LogoMark` and `Logo` from `apps/web/src/components/brand.tsx`. The product name lives in its `BRAND` constant.
- The link-preview image is `apps/web/app/opengraph-image.tsx`, which Next renders at build time.

## Rules

- The highlight is always coral; never recolour it.
- The ring and lines follow the text colour: ink on light, cream on dark.
- At 16 px and below, use the small mark.
- The wordmark is one word with the second half in coral, never two words.
- Keep clear space of at least a quarter of the mark's width on every side.
