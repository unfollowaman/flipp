## 2025-05-15 - PDF Editor Toolbar Accessibility
**Learning:** Interactive toolbar icon buttons and action controls in complex web application editors (such as PDF editors) often lack explicit `aria-label` attributes, making them inaccessible or confusing for screen readers even when visible text/icons are present.
**Action:** Always verify and include descriptive `aria-label` attributes for tool selection, formatting toggles, and navigation buttons in editor viewports.

## 2026-09-16 - FAQ Accordion Aria Controls Association
**Learning:** Accordion toggle buttons that update `aria-expanded` require an `aria-controls` attribute pointing to the ID of the collapsible panel so screen readers can associate the trigger with the content region.
**Action:** Automatically generate unique panel IDs and set `aria-controls` during script initialization if explicit IDs are absent on accordion elements.
