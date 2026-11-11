# Mnemo design system

Mnemo 1.2.4 introduced a card-based dashboard interface. The visual language is
defined once in [`src/index.css`](../src/index.css) and consumed through the
shared primitives in `src/components/ui/`, so screens never redefine colours,
radii, elevation or control sizes on their own.

This document describes the system as shipped. It is a reference for future
work, not a roadmap.

## Principles

1. **Surfaces instead of rules.** Content is grouped by background, spacing and
   elevation. Hairline borders are reserved for genuine table structure and for
   the rare case where a surface sits on the same colour as its parent.
2. **One accent, used deliberately.** Cobalt marks primary actions, the active
   navigation item, progress and key figures. Everything else is neutral.
3. **Generous space.** The canvas is padded (24–48 px depending on window width)
   and cards carry 20–24 px of internal padding.
4. **Editorial headings, modern body.** Instrument Serif stays for page and card
   titles; Instrument Sans carries interface text; JetBrains Mono is limited to
   compact numeric metadata.

## Tokens

All tokens live on `:root` and are overridden by `.dark`. Accent palettes are
selected with `[data-accent="…"]`, which only replaces accent values — never the
neutral field.

| Token | Role |
| --- | --- |
| `--canvas` / `--background` | Application field (`oklch(0.966 0.008 255)`, `#F3F5F9`) |
| `--card` / `--raised` | Card and popover surfaces (white in light mode) |
| `--secondary` / `--muted` / `--sunken` | In-card grouping and control fills |
| `--foreground` | Deep navy text (`#17233F` in light mode) |
| `--muted-foreground` | Secondary text and metadata |
| `--primary` | Cobalt accent (`oklch(0.492 0.188 266)`, `#1746C8`) |
| `--primary-soft` | Tinted accent surface for selection and icon chips |
| `--success` / `--warning` / `--destructive` | Semantic status colours |
| `--border` / `--hairline` | Structural rules only |
| `--radius` | Base radius, 12 px; `sm/md/lg/xl/2xl/3xl` derive from it |
| `--elev-soft` / `--elev-lift` / `--elev-float` | Three-step elevation scale |
| `--shadow-soft` / `--shadow-lift` / `--shadow-float` | Tailwind utilities for the same scale |

### Accents

`blue` is the default. `ember`, `violet`, `teal`, `rose` and `amber` remain
available in Settings → General → Accent colour and keep the same persisted
values as before, so existing installations retain their choice.

## Components

- **Card** — `rounded-xl bg-card shadow-soft`, 20–24 px padding. The default way
  to group content.
- **Button** — 36 px default height, 12 px radius. `default` is solid accent;
  `outline` is a white raised surface with no border; `ghost` and `soft` are for
  secondary and in-card actions.
- **Input / Textarea / Select** — 40 px height, soft `secondary` fill, no border,
  accent focus outline; focus turns the fill white.
- **Tabs** — a segmented control on `bg-secondary/70` with a raised active pill.
- **Badge** — pill on a tinted surface, no outline.
- **Dialog** — 24 px radius, `shadow-float`, no border, 28 px padding.
- **Menu / Select / Popover** — `bg-popover shadow-lift`, 12 px radius, no border.
- **Tooltip** — inverted chip (`bg-foreground text-background`).
- **Study set card** — title, muted metadata with dot separators, and a progress
  bar pinned to the bottom. Hover lifts the card by 2 px.

## States

- **Focus** — 2 px accent outline at 70 % opacity with a 2 px offset via
  `.focus-ring`. Applied to every interactive primitive, including inputs.
- **Hover** — surface tint change or a 2 px lift; never colour-only.
- **Selected** — `--primary-soft` fill plus accent text, or a solid accent fill
  for segmented controls.
- **Disabled** — 45 % opacity and pointer events disabled.
- **Reduced motion** — `prefers-reduced-motion` and the in-app animation setting
  both collapse transitions and animations.

## Dark theme

The dark theme mirrors the light structure: `--canvas` at
`oklch(0.185 0.014 262)`, cards one step lighter, elevated popovers one step
lighter again. The accent brightens (`oklch(0.706 0.138 267)`) with dark accent
foreground so primary buttons stay legible. Shadows gain opacity rather than
size, and borders stay at 8 % white so structure never becomes a wireframe.
