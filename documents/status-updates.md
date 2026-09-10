# Status Updates

## 2026-09-04 — Code review of local commits (master, not yet pushed)

**Scope:** 4 local commits on `master` ahead of `origin/master` (`704049f`, `573ed99`, `7cb9ed0`, `f000bd2`).
**Status:** Reviewed, not pushed. `master` and `origin/master` have diverged (4 local vs 26 remote commits) — nothing below is live.

### Findings

1. **Unauthenticated user CRUD** (`src/server.js:71`) — `/faceRecognition` is mounted with the full users router (create/list/update/delete) with no `authenticateToken` middleware. Pre-existing, not introduced by these commits, but highest severity issue in the codebase.
2. **JWT moved from httpOnly cookie to response body** (`src/controllers/authController.js`, `src/server.js`) — commit `f000bd2` ("token removed") stopped setting the token as an httpOnly cookie and dropped `cookie-parser`; token now returned in the JSON body. Increases XSS blast radius (token becomes readable by injected scripts if stored client-side).
3. **`/auth` alias and `/me` endpoint removed** — same commit removed `app.use("/auth", authRoutes)` and `GET /user/me`. Any client still calling those routes will get a 404.
4. **CORS opened to all origins** (`src/server.js:60`) — replaced an explicit allowlist (`localhost:5173`, `agsoftsolutions.co.in`) with unrestricted `cors()`.

### Next steps
- Decide whether the cookie → body token change was intentional; if not, restore httpOnly cookie handling.
- Lock down `/faceRecognition` with `authenticateToken` or point it at the dedicated face-recognition router instead of the users router.
- Confirm no deployed client still depends on `/auth/*` or `/user/me` before leaving them removed.
- Resolve branch divergence with `origin/master` before pushing.
