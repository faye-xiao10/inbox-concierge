# STYLE.md — Gmail Inbox Concierge

Warm, earthy productivity tool. Inspired by Obsidian's warm theme — cozy but functional, never sterile.

## Tokens

```css
:root {
  /* Backgrounds */
  --bg-primary: #FAF5EE;
  --bg-secondary: #F0E8DA;
  --bg-tertiary: #E6DCCC;
  --bg-elevated: #FFFFFF;

  /* Text */
  --text-primary: #3B3226;
  --text-secondary: #7A6E5D;
  --text-tertiary: #A89B8A;

  /* Accent */
  --accent-primary: #B8860B;
  --accent-hover: #9A7209;
  --accent-subtle: rgba(184, 134, 11, 0.1);

  /* Semantic */
  --color-success: #5B8C5A;
  --color-warning: #C4933F;
  --color-error: #B5544E;
  --color-info: #5B7FA5;

  /* Borders */
  --border-default: #DDD2C0;
  --border-subtle: #E8DFD0;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(59, 50, 38, 0.06);
  --shadow-md: 0 4px 12px rgba(59, 50, 38, 0.08);

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Fonts */
  --font-body: 'Source Sans 3', 'Segoe UI', sans-serif;
  --font-heading: 'Fraunces', 'Georgia', serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

## Typography

| Token        | Size | Weight | Use                         |
|--------------|------|--------|-----------------------------|
| heading-xl   | 24px | 700    | Page titles                 |
| heading-lg   | 20px | 600    | Section headers             |
| heading-md   | 16px | 600    | Card titles, email subjects |
| body         | 14px | 400    | Default text                |
| body-sm      | 13px | 400    | Metadata, secondary info    |
| caption      | 12px | 400    | Timestamps, labels          |

Line height: body 1.55, headings 1.25.

## Spacing (4px base)

4 xs · 8 sm · 12 md · 16 lg · 24 xl · 32 2xl · 48 3xl

## Do

- Use warm tones consistently — even grays lean warm
- Use Fraunces sparingly — page titles, empty states only
- Use Lucide icons, outlined, 16px
- Transitions: 150ms ease, no springs or bounces
- Sidebar + content layout, not top-nav

## Don't

- Use pure black (#000) or pure white (#FFF) for text/bg
- Use blue as default link/accent color — use gold
- Add shadows to everything — only for elevation changes
- Use more than 2 font families in one view
- Over-animate — this is a productivity tool