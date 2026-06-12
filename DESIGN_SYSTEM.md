---
name: Desert Study
colors:
  surface: '#fff8f5'
  surface-dim: '#e9d7c8'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1e7'
  surface-container: '#feeadb'
  surface-container-high: '#f8e5d6'
  surface-container-highest: '#f2dfd0'
  on-surface: '#231a11'
  on-surface-variant: '#55433b'
  inverse-surface: '#392e24'
  inverse-on-surface: '#ffeee1'
  outline: '#88736a'
  outline-variant: '#dbc1b7'
  surface-tint: '#97471f'
  primary: '#94451d'
  on-primary: '#ffffff'
  primary-container: '#b35d33'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb595'
  secondary: '#4c653e'
  on-secondary: '#ffffff'
  secondary-container: '#cdecba'
  on-secondary-container: '#516c44'
  tertiary: '#7a5500'
  on-tertiary: '#ffffff'
  tertiary-container: '#996c04'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcd'
  primary-fixed-dim: '#ffb595'
  on-primary-fixed: '#360f00'
  on-primary-fixed-variant: '#793108'
  secondary-fixed: '#cdecba'
  secondary-fixed-dim: '#b2cf9f'
  on-secondary-fixed: '#0a2003'
  on-secondary-fixed-variant: '#344d28'
  tertiary-fixed: '#ffdeaa'
  tertiary-fixed-dim: '#f5bd58'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5f4100'
  background: '#fff8f5'
  on-background: '#231a11'
  surface-variant: '#f2dfd0'
typography:
  display-lg:
    fontFamily: Noto Serif
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Noto Serif
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Noto Serif
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  display-lg-mobile:
    fontFamily: Noto Serif
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
  card-padding: 24px
  stack-gap: 12px
---

## Brand & Style
The design system is anchored in the concept of a "sunlit study"—a space that feels tactile, grounded, and intellectually stimulating yet calm. It avoids the sterile coldness of modern SaaS by embracing warm, organic tones and editorial layouts.

The style is **Retro-Minimalism** with a **Tactile** edge. It prioritizes clarity and focus through generous whitespace, high-quality typography, and structural borders rather than aggressive shadows. The interface should feel like physical stationery—high-quality paper, ink, and linen textures. It is designed specifically for Hebrew-first environments, ensuring that the RTL (Right-to-Left) flow feels native and rhythmic rather than mirrored.

## Colors
The palette is inspired by natural pigments—terracotta, sage, and espresso. 

- **Primary (Terracotta):** Used for primary actions and highlights. It provides a warm, clay-like focal point.
- **Secondary (Sage):** Used for secondary markers, growth-related tasks, or organizational categories.
- **Surface (Paper):** The brightest neutral, used for cards and main content areas to mimic the feel of an open notebook.
- **Background (Desert Sand):** A warm, desaturated base that reduces eye strain compared to pure white.
- **Navigation (Oat):** A slightly deeper tone to provide structural hierarchy without harsh contrast.

**Dark Mode Logic:** When active, the palette shifts to "Twilight Study" (#221E18), utilizing deep wood and charcoal tones while maintaining the warm amber glow for primary accents.

## Typography
The typography system relies on the interplay between a classic, humanist serif for titles and a clean, legible sans-serif for functional text.

- **Headlines:** Use Noto Serif (or similar high-quality Hebrew serifs). This provides the "editorial" feel, making tasks and notes feel like entries in a curated journal.
- **Body & Labels:** Use Inter (or Heebo for native Hebrew optimization). These are kept functional and neutral to ensure long-form reading remains comfortable.
- **Line Height:** Generous leading is essential to the "sunlit" feel, allowing the text to breathe.
- **RTL Alignment:** All text is right-aligned by default. Ensure that serif numerals (Oldstyle figures) are used where available to match the classic aesthetic.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop and a **Fluid Fluid** approach on mobile. 

- **The 8px Rhythm:** All spacing is a multiple of 4px or 8px. 
- **RTL Flow:** The layout starts from the top-right. Sidebars are docked to the right, and content flows leftward. 
- **Desktop:** A central "manuscript" column (max-width 800px) is preferred for reading and writing, centered within the viewport.
- **Mobile:** Elements span the full width of the screen with 20px side margins.
- **Gutters:** 16px constant between grid items to maintain a tight, organized "study" appearance.

## Elevation & Depth
Depth in this design system is achieved through **Tonal Layers** and **Structural Outlines** rather than heavy shadows.

- **The "Stacked Paper" Effect:** Depth is created by placing #FBF8F1 (Paper) surfaces on top of #F4EFE4 (Desert Sand) backgrounds.
- **Borders:** Use #DBD0BB (1px solid) for almost all containers. This reinforces the "grid" and "planner" feel.
- **Shadows:** Reserved strictly for interactive elements in an active state (e.g., a card being dragged or a button being hovered). Use a soft, warm shadow: `0px 4px 12px rgba(58, 47, 37, 0.08)`.
- **Z-Index Hierarchy:** 
  - Level 0: Background (Desert Sand)
  - Level 1: Sidebar (Oat)
  - Level 2: Main Cards (Paper)
  - Level 3: Modals/Popovers (Paper with 1px border)

## Shapes
Shapes are friendly but disciplined. 

- **Standard Elements:** Buttons and input fields use a **0.5rem (8px)** radius.
- **Containers:** Content cards use a **1rem (10px - 16px)** radius to feel substantial and distinct from the background.
- **Modals:** Use the largest radius **1.5rem (24px)** on top corners for a "sheet" feel on mobile, or 14px on all sides for desktop.
- **RTL Considerations:** Rounded corners are mirrored; ensure "Start" and "End" logical properties are used in CSS to maintain the intended aesthetic across languages.

## Components
- **Buttons:** Solid primary buttons use Terracotta with Espresso text (or white for high contrast). Secondary buttons use the Linen background with a 1px border.
- **Input Fields:** Use the Paper color for backgrounds with a 1px border. Labels are always placed above the field, right-aligned.
- **Cards:** The workhorse of the system. Cards should have a 1px border in #DBD0BB. No shadow unless the card is interactive or being "picked up."
- **Chips:** Small, rounded-pill shapes used for tagging. Utilize the "Board Dots" palette (Clay, Sage, Ochre, etc.) for background tints with dark espresso text.
- **Checkboxes:** Square with a 4px radius. When checked, they fill with Sage (#7E9A6E) rather than the primary Terracotta to signal "peaceful completion."
- **Navigation:** The sidebar uses the "Oat" color. Active items are indicated by a small Terracotta vertical bar on the right-hand edge (the "start" edge in RTL).