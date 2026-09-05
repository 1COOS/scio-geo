# scio-geo repository guidance

## Product and architecture

- Scio Geo is a local-first Web/PWA for teenagers to explore countries, capitals, flags, and geography through an interactive 3D globe.
- Keep the core experience usable without an account, backend, or network connection after installation.
- Keep educational content in repository-owned structured data. Validate content with Zod at load or build time; do not silently accept malformed country or quiz data.
- Keep boundaries clear between `src/scene` (Three/R3F rendering), `src/features` (product and game behavior), `src/data` (reviewed educational content), `src/storage` (local persistence), and `src/shared` (reusable UI/utilities).

## Tooling

- Use Bun 1.3.13 as the only package manager and script runner. Keep `packageManager` pinned and commit only `bun.lock`; do not add npm, pnpm, or Yarn lock files.
- Use React 19, TypeScript, Vite, React Three Fiber, and `r3f-globe`. Do not add a backend, SSR framework, or physics engine without an explicit product need.
- Prefer existing dependencies and browser APIs before adding a new production dependency.

## 3D and interaction rules

- Do not update React or Zustand state on every render frame. Keep per-frame animation state in Three.js objects, refs, shaders, or dedicated render-loop code.
- Synchronize `r3f-globe` with the active camera whenever controls or programmed camera movement change the view.
- Every new 3D effect must define a mobile-performance strategy and must still work when the low-quality mode disables expensive post-processing or lowers detail.
- Respect `prefers-reduced-motion`: disable autonomous motion and avoid essential information that is only communicated through animation.
- Preserve keyboard access, visible focus, touch usability, readable contrast, and a useful WebGL-unavailable fallback.
- Do not introduce runtime dependencies on external images, flags, textures, or educational APIs for the core experience. Store reviewed assets locally with their source/license documented.

## Data and persistence

- Treat country codes as stable identifiers and keep geographic coordinates within schema-validated ranges.
- Version IndexedDB schema changes deliberately. Provide migration or safe defaults when stored data shapes change.
- Never collect precise location, personal information, or analytics from minors without an explicitly approved privacy design.

## Verification and delivery

- Run focused tests while working. Before handoff, run `bun run check`.
- `bun run check` must cover lint, TypeScript, formatting, unit tests, production build, and Playwright tests.
- Verify both desktop and mobile layouts for material visual changes, and inspect the production preview for 3D interaction or PWA changes.
- Do not commit or push unless the user explicitly requests it. Preserve unrelated user changes in a dirty worktree.
