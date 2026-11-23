---
version: alpha
name: Formable Docs
description: A light, editorial SaaS system with restrained contrast, crisp typography, and one vivid blue accent.
colors:
  primary: "#2D4FFF"
  secondary: "#303239"
  tertiary: "#141518"
  neutral: "#FFFFFF"
  surface: "#F4F5F8"
  on-surface: "#0A0A0A"
  error: "#D94C4C"
  primary-60: "#5E78FF"
  primary-70: "#7B8EFF"
  primary-20: "#DDE4FF"
  border-subtle: "#D7DAE3"
  border-strong: "#BFC6D6"
typography:
  headline-display:
    fontFamily: Inter
    fontSize: 62px
    fontWeight: 550
    lineHeight: 62.832px
    letterSpacing: -2.464px
  headline-lg:
    fontFamily: Inter
    fontSize: 45px
    fontWeight: 550
    lineHeight: 51.04px
    letterSpacing: -0.616px
  headline-md:
    fontFamily: Helvetica Neue
    fontSize: 32px
    fontWeight: 500
    lineHeight: 38px
    letterSpacing: -0.264px
  headline-sm:
    fontFamily: Inter
    fontSize: 23px
    fontWeight: 500
    lineHeight: 28px
    letterSpacing: -0.18px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 400
    lineHeight: 25.5px
    letterSpacing: -0.051px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: -0.04px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.02px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.01px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: -0.01px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: -0.01px
rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xs: 6px
  sm: 14px
  md: 24px
  lg: 48px
  xl: 56px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px 18px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px 18px
    height: 40px
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: 10px 18px
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.primary-20}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: 10px 18px
    height: 40px
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 0px
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 14px
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px 12px
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px 10px
---

# Formable Docs

## Overview
Formable presents as a modern, high-trust SaaS brand: minimal, efficient, and quietly confident. The visual tone is spacious and airy, with a strong editorial headline, restrained UI chrome, and one electric blue accent that signals action without feeling playful. It is designed for professional teams that need clarity and speed more than decoration.

## Colors
- **Primary (#2D4FFF):** A saturated electric blue used for emphasis, secondary action outlines, links, and active states. It provides the system's only vivid chromatic signal and should stay reserved for interactive or informational highlights.
- **Secondary (#303239):** A soft charcoal used for secondary text, navigation labels, and less-prominent interface copy. It reads dark enough to stay legible without competing with the main headline color.
- **Tertiary (#141518):** The near-black button and brand-dark tone used for the main CTA and the most assertive UI elements. It gives the interface a grounded, premium feel.
- **Neutral (#FFFFFF):** The main canvas and card fill color. Most content sits on pure white, reinforcing the system's clean and uncluttered presentation.
- **Surface (#F4F5F8):** A very light cool gray used for subtle panels, backgrounds, and tonal separation when pure white would feel too flat.
- **On-surface (#0A0A0A):** The primary text color for hero headlines and high-contrast content. It is deeper than standard black, which keeps the look crisp but slightly softer.
- **Error (#D94C4C):** A restrained red reserved for validation or destructive feedback. It should remain sparse so it doesn't disrupt the otherwise calm palette.
- **Primary-20 (#DDE4FF):** A pale blue tint for hover fills, selected backgrounds, and faint accent washes.
- **Primary-60 (#5E78FF):** A lighter blue for intermediate emphasis and soft active states.
- **Primary-70 (#7B8EFF):** A gentler mid-blue for gradients or transition states when a softer accent is needed.
- **Border-subtle (#D7DAE3):** A light cool border tone for separators and card outlines.
- **Border-strong (#BFC6D6):** A slightly darker border tone for emphasized framing, active fields, or dense UI.

## Typography
Inter is the core interface family, and it carries most of the system from UI labels to display headlines. The one exception is `headline-md`, which uses Helvetica Neue to echo the slightly more editorial, product-marketing feel seen in the source.

Headlines are bold but not heavy; the display treatment uses a 550 weight with tight negative tracking for a polished, compact hero stack. Body copy stays at 400 weight with modestly compressed letter spacing, creating a clean, modern reading rhythm. Labels and buttons use medium weight to feel functional and precise.

The design favors sentence case and avoids shouting. There is no visible uppercase navigation system, so headings and controls should remain natural, readable, and minimally stylized unless a specific component needs subtle emphasis.

## Layout
The layout is expansive and centered on a large hero composition with generous negative space. Content is not locked into a dense multi-column grid; instead, it uses a broad, fixed-feeling canvas with large horizontal breathing room and a prominent diagonal product montage.

Spacing is governed by a small, disciplined scale: 6px, 14px, 24px, 48px, and 56px. Use 14px for compact UI gaps, 24px for standard section rhythm, and 48px to 56px for major page separation and hero breathing room. Cards and panels should use modest internal padding rather than large padded frames, keeping the interface light and product-led.

## Elevation & Depth
The system is mostly flat and depends on contrast, borders, and layering rather than dramatic shadow. White cards sit on subtle cool backgrounds with faint edges, while the product mockups use soft shadowing to separate layered panels from the page.

When depth is needed, keep it restrained: use a light shadow like the card treatment in YAML rather than large blurred elevation. Avoid glossy effects, heavy translucency, or strong inset treatments. The hierarchy should feel crisp and editorial, not material or skeuomorphic.

## Shapes
The shape language is soft and functional. Buttons use small to medium radii, with the primary action slightly rounder than the secondary outline treatment. Cards use a 12px radius, which is enough to soften the system without making it feel friendly or casual.

Overall, the geometry is clean and slightly rounded, with no pill-heavy interface except for full-round chips or status tags. The result should feel precise, modern, and product-first.

## Components
Buttons:
- `button-primary` is the main action style: dark fill, white text, 10px by 18px padding, 40px height, and an 8px radius. Use it for the strongest conversion action such as "Book a demo."
- `button-primary-hover` should deepen visually while preserving the same size and typography.
- `button-secondary` is the accent-outline treatment: transparent fill, blue text, light blue border, and a slightly tighter 6px radius. Use it for less dominant but still actionable controls.
- `button-link` is a text-only control for lightweight navigation, with no border, no fill, and no fixed minimum size.

Cards:
- Cards are white, bordered, and lightly shadowed. Use `card` for content containers, previews, or UI screenshots. Keep padding compact at 14px so the card feels like a frame rather than a block.
- Card borders should remain subtle and cool; avoid dark outlines unless you want a modal or selected state.

Inputs:
- Inputs should stay simple and quiet: white fill, dark text, 8px radius, and modest padding. Borders should be low-contrast unless focused.
- Use the same typography as body controls so form fields blend into the rest of the interface instead of feeling oversized.

Chips and small tags:
- Use `chip` for compact status labels, navigation pills, or metadata badges. Keep them softly tinted and fully rounded to reinforce the lightweight SaaS feel.

Navigation:
- Top navigation should use small, subdued labels with minimal chrome. Active or hovered items can lean on the blue accent, but the default state should stay muted.

Lists and content panels:
- Lists should be compact, with clear spacing between items and minimal ornament. Use borders and typographic hierarchy before adding visual decoration.

## Do's and Don'ts
- Do keep the interface spacious and restrained, with large headline breathing room and modest component padding.
- Do use the blue accent sparingly to mark action, focus, or active states.
- Do prefer crisp, high-contrast text with compact negative tracking for headlines.
- Do maintain a mostly white, lightly cool-toned surface with subtle borders.
- Don't introduce heavy gradients, glassmorphism, or colorful backgrounds that compete with the product story.
- Don't over-round primary controls; keep the shape language controlled and professional.
- Don't use dense shadows or deep elevation as the main hierarchy cue.
- Don't let secondary navigation or metadata overpower the primary CTA or headline.

