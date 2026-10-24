# Page contract (hosting rules for the final single-file HTML page)

The page is published as a hosted "Artifact": one self-contained HTML file.

## Skeleton
- Do NOT write `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` tags. The host wraps the file. Start the file with:
  `<title>Name</title>`, `<meta name="claude:viewport-fit-sides" content="cover">`, then `<style>`, then content, then `<script>`.
- Title: a short product-like name (2-4 words), no "Name: explainer" or dash suffix.
- Host reset pads `:root` top/bottom by safe-area insets: keep that (do not override :root padding).
- Toggle visibility with `el.hidden`, not `style.display`.

## External resources (CSP enforced)
- Scripts ONLY from cdnjs.cloudflare.com (preferred), cdn.jsdelivr.net/npm/, unpkg.com, pinned exact versions. Prefer NO libraries; vanilla JS is fine.
- Stylesheets ONLY from fonts.googleapis.com (Google Fonts). Always give a fallback font stack.
- No external images, fetch, iframes, embeds. Inline SVG / CSS / canvas only. Images as data: URIs if any.
- Links to other sites (`https://...`) are fine as plain `<a href target="_blank" rel="noopener">`.
- alert/confirm/prompt do nothing. window.print does nothing. Forms: handle submit in JS with preventDefault.
- localStorage works but may throw or be empty: wrap every read/write in try/catch and render fine without it. Use for per-viewer state only.

## Responsive
- Must work at ~400px phone width. Body never scrolls horizontally.
- Side gutter on body or ONE outer wrapper (or each full-width band's inner wrapper):
  `padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));`
  Vertical padding via `padding-block`, never a `padding` shorthand on that element.
- Flex/grid with gap; min-width:0 on children holding text; rows stack at narrow width.
- Sticky header: `top: env(safe-area-inset-top, 0px)` plus a `body::before` fixed band painted in the header bg.
- Do not size hero to 100vh; size to content.

## Theme (light + dark), token pattern REQUIRED
```css
:root { --bg: ...; --fg: ...; --accent: ...; }   /* every token, light values */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: ...; ...; color-scheme: dark } }
:root[data-theme="dark"] { --bg: ...; ...; color-scheme: dark }   /* same dark values */
body { background: var(--bg); color: var(--fg) }
```
Every color is a token defined first on bare :root. No literal colors in component rules that only work in one theme.

## Quality
- Page complete at rest: nothing left at opacity:0 waiting for scroll observers.
- Visible keyboard focus. Respect prefers-reduced-motion. Every form control has a stable id.
- tabular-nums for aligned digits.
- Avoid the "AI default" looks: cream + serif + terracotta; near-black + acid green pop; purple-blue gradient hero; Inter/Space Grotesk; emoji section markers; everything centered; rounded-lg + shadow on every block; numbered 01/02/03 markers unless it's a real sequence.
- Copy: plain, active voice, specific. No em dashes or en dashes anywhere (use commas, colons, full stops, parentheses).
