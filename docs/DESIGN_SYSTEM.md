# HackStop design system — v5.2.3

## Visual direction
Professional, mobile-first builder platform with a clean light default theme and an optional deep-navy dark theme. Pink is the primary action/accent; sky blue is used for links, secondary actions and informational elements. Keep surfaces calm and gradients restrained.

## Brand tokens
- Light background: `#F4F9FF`; surface: `#FFFFFF`; raised surface: `#EDF6FF`.
- Light text: `#17263A`; muted text: `#52647B`; borders: `rgba(30,78,120,.15)`.
- Pink action: `#B52F70`; sky-blue action/link: `#126F9E`. Both maintain at least 4.5:1 contrast on the light surface.
- Dark background: `#101A2B`; surface: `#17253A`; raised surface: `#1D3049`.
- Dark text: `#F4F8FF`; muted: `#B1C1D4`; pink: `#F17AB1`; sky blue: `#75C9F1`.
- Radius: 12–20px; soft layered shadows; 4px spacing base with 8, 12, 16, 24, 32 and 48px steps.

## Typography and controls
- Inter is the primary UI family. Base/body text is `1rem` (16px) with line-height 1.6. Primary explanatory copy may use 17–18px.
- Use 14–15px only for timestamps, tertiary metadata and captions. Form controls use at least 16px to avoid iOS input zoom.
- Buttons, navigation and interactive chips target a minimum 44px tap height. Visible `:focus-visible` outlines are required.

## Responsive behavior
- Mobile-first layout; cards and forms stack at narrow widths; desktop directory/event grids collapse progressively.
- No intended horizontal page scrolling; content wraps and uses `min-width:0` in grid/flex children.
- Mobile navigation collapses to a menu. Modals use full-height/bottom-sheet behavior on small screens. Chat keeps its composer anchored with safe-area padding.
- Verify at 320, 375, 414, 768, 1024 and 1280+ CSS pixels, plus 200% zoom.

## Accessibility and motion
- Target WCAG 2.2 AA contrast, keyboard navigation, semantic labels, visible focus and reduced-motion preferences.
- Do not rely on color alone to communicate unread, active, error or privacy states.
- The minimum tap-target rule is applied to buttons, message actions, reaction controls and navigation links.


## Functional light and dark themes (v5.2.3)

HackStop applies the saved theme before the first paint using `html[data-theme]`, then a small standalone controller synchronizes the body theme classes, native `color-scheme`, theme-color browser metadata, and the accessible theme-toggle label. The toggle works independently of Firebase authentication or Firestore module initialization. The preference is saved in `localStorage` under `hackstop-theme` (with migration read support for the prior `hackverse-theme` key). On first visit, the OS color preference is used. The header theme control remains visible on mobile. Both themes use the same semantic design tokens for page backgrounds, cards, forms, navigation, chat, modals, and workspace surfaces.
