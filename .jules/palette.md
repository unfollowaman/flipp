## 2025-05-15 - PDF Editor Toolbar Accessibility
**Learning:** Interactive toolbar icon buttons and action controls in complex web application editors (such as PDF editors) often lack explicit `aria-label` attributes, making them inaccessible or confusing for screen readers even when visible text/icons are present.
**Action:** Always verify and include descriptive `aria-label` attributes for tool selection, formatting toggles, and navigation buttons in editor viewports.

## 2026-09-16 - FAQ Accordion Aria Controls Association
**Learning:** Accordion toggle buttons that update `aria-expanded` require an `aria-controls` attribute pointing to the ID of the collapsible panel so screen readers can associate the trigger with the content region.
**Action:** Automatically generate unique panel IDs and set `aria-controls` during script initialization if explicit IDs are absent on accordion elements.

## 2026-09-19 - Toolbar Toggle Button Aria Pressed Sync
**Learning:** Stateful tool selection and formatting toggle buttons inside application toolbars require `aria-pressed` attributes ("true"/"false") synchronized dynamically alongside CSS `.active` classes so screen readers announce active tool states.
**Action:** Include `role="toolbar"` and `aria-label` on toolbar containers, initialize `aria-pressed` on toggle buttons, and update `aria-pressed` in event listeners and reset routines.

## 2026-09-20 - Password Input Visibility Toggle Accessibility
**Learning:** Password inputs benefit from accessible toggle controls (`<button type="button">`) that dynamically update `type` ("password" / "text"), `aria-label`, and `title` ("Show password" / "Hide password") to give visual feedback and screen reader clarity.
**Action:** Use relative positioning wrappers for password fields and sync `aria-label` and `title` state on toggle clicks.
