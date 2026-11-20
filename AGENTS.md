# Flipp Development & Architectural Guidelines

These guidelines are active across the entire Flipp codebase. Agents and developers must adhere to these invariants.

---

## 1. Client-Side Drop Zones & Clipboard Pasting
- **Zero-Server Philosophy**: All file operations run 100% client-side in the browser. Never introduce backend file transmission endpoints.
- **Editable Element Guard**: Global paste listeners (`Ctrl+V`) must check `document.activeElement` and immediately return if the user is typing in `<input>`, `<textarea>`, `.text-pdf-input`, or any element with `isContentEditable`.
- **MIME & Format Validation**:
  - Standard tools accept PDF only (`.pdf`, `application/pdf`).
  - `images-to-pdf` accepts image files only (`image/*`).
  - `merge-pdf` accepts both PDFs and images.
  - `text-to-pdf` accepts text documents (`.txt`, `.md`, `.csv`, `.log`, `.json`).
- **Non-Destructive Feedback**: When invalid document formats are pasted or dropped, display clear user-facing feedback (`showToast(msg, "warning")` and `.drop-zone.drop-warning` shake animation) rather than throwing uncaught errors or failing silently.
- **Multi-File Pastes**: Filter valid files for processing and alert the user if any invalid files were skipped. If no files are valid, do not trigger processing.

---

## 2. CSS Source vs. Minified Build Invariant
- **Source of Truth**: `css/styles.src.css` is the authoritative stylesheet.
- **Rebuilding Minified CSS**: `css/styles.css` is generated using:
  ```bash
  npm run minify:css
  # or: cleancss -O0 css/styles.src.css -o css/styles.css
  ```
- **Merge Conflict Resolution**: Never edit or splice conflict markers inside minified `css/styles.css`. Always resolve conflicts in `css/styles.src.css` first, stage it, run the CSS minifier, and stage the freshly compiled `css/styles.css`.

---

## 3. Testing Invariants (`node --test`)
- **Browser Mocking**: Unit tests in `tests/*.test.js` evaluate client-side scripts using `new Function()` or global DOM mocks (`window`, `document`, `Event`, `File`). Avoid unmocked direct `require()` calls to npm packages not listed in production dependencies.
- **State Reset Invariants**: Any module that tracks targets or binds global DOM listeners (e.g., `js/drag-drop.js`) must export a reset helper (e.g., `resetPasteTargets()`) that resets both target lists and listener registration flags (`globalPasteListenerBound = false`) to guarantee complete test isolation.

---

## 4. Git Operations in Windows Worktrees
- **Worktree Boundary Access**: When executing git writes (`add`, `commit`, `rebase`, `checkout`) or network operations (`push`, `fetch`) where the worktree index links to an external `.git` location, run with bypass permissions to prevent `index.lock` permission failures.
- **Non-Interactive Rebase Editor**: If rebasing encounters an editor prompt on Windows where `$env:GIT_EDITOR` is `'false'`, use an argument-safe no-op editor command:
  ```powershell
  $env:GIT_EDITOR='node -e "process.exit(0)"'; git rebase --continue
  ```
  Avoid `cmd /c` wrappers that misinterpret `\.git\COMMIT_EDITMSG` backslashes as flags.
