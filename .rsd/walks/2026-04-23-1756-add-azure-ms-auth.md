# Walk: add-azure-ms-auth

Started: 2026-04-23 17:56 · Branch: main · Start commit: 0edda22
Status: complete
Totals: 6 items · 5 done · 1 rejected · 0 deferred · 0 modified · 0 unresolved

<!--
A walk is a living tasklist. Items are resolved one at a time via /rsd:next.
After each resolution, remaining items may be flagged for re-check if the fix
affected them. Flags are surfaced in chat and recorded inline, not auto-edited.
-->

## Items

### 1. Install deps — done

**Recommendation**
`npm install @azure/msal-browser jose` (and remove `google-auth-library`). One generic JWT library (`jose`) verifies both Google and Microsoft tokens server-side; `@azure/msal-browser` issues Microsoft ID tokens client-side. Library swap; Google sign-in remains fully supported.

**Discussion**
Installed `@azure/msal-browser ^5.8.0` and `jose ^6.2.2`. `npm run build` green. The `npm uninstall google-auth-library` was deferred to item 2 to avoid leaving the API broken between items — `verify-token.js` still imports `OAuth2Client` until the refactor lands.

**Resolution**
done · installed @azure/msal-browser + jose; uninstall of google-auth-library deferred to item 2

### 2. Refactor verify-token.js for both providers — done

**Recommendation**
Refactor `api/_lib/verify-token.js` to verify both Google + Microsoft JWTs via `jose`. Read the `iss` claim → pick the right JWKs URL (Google: `https://www.googleapis.com/oauth2/v3/certs`, Microsoft: `https://login.microsoftonline.com/common/discovery/v2.0/keys`) and audience (Google client ID or Microsoft client ID) → verify. `ALLOWED_EMAILS` check applies after, unchanged.

**Discussion**
Rewrote with `jose` (`createRemoteJWKSet`, `jwtVerify`, `decodeJwt`). Issuer routing: Google issuers are a fixed allowlist; Microsoft issuer is matched via regex (`/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/`) since multi-tenant tokens carry the user's tenant GUID, not "common". JWKs are fetched from `/common/discovery/v2.0/keys` regardless. Email handling: Google uses `email` + `email_verified`; Microsoft falls back to `preferred_username` if `email` claim absent (no `email_verified` — work accounts presumed verified). Return value adds `provider` field. Server-misconfig check now requires *at least one* client ID rather than only Google. Uninstalled `google-auth-library` (the deferred scope expansion from item 1's flag). `node --check` passes; `npm run build` green.

**Resolution**
done · jose-based verifier supports both providers; google-auth-library uninstalled

### 3. Add MSAL.js + Microsoft sign-in button to LoginPage — done

**Recommendation**
Add MSAL.js setup + a "Sign in with Microsoft" button to `LoginPage.jsx`. Initialize `PublicClientApplication` with the multi-tenant authority and `VITE_MICROSOFT_CLIENT_ID`. Trigger interactive sign-in (`loginPopup` or `loginRedirect`); on success, hand the ID token to `useAuth().signIn(token)`.

**Discussion**
Long path. First implementation used `loginPopup` — the popup callback URL got stripped by `ProtectedRoute`'s redirect to `/login`, so the parent never saw the auth code and popups never closed. Three speculative fixes failed (catch interaction_in_progress, init MSAL before React, render-null defense in ProtectedRoute). Switched to `loginRedirect` instead — full-page redirect to Microsoft, full-page redirect back. Refactor created `src/lib/msal.js` (singleton + ensureMsalReady) and `src/lib/auth-storage.js` (shared session helpers); `main.jsx` now awaits MSAL init via top-level await before React mounts and writes the ID token to sessionStorage so AuthProvider's initial state picks it up. Also fought a separate Azure misconfig: the App Registration had the redirect URI under "Web" platform (per prior Claude Desktop guidance) instead of "Single-page application", causing `AADSTS70002: must include a 'client_secret'`. Scott flipped it to SPA platform; sign-in works end-to-end in Incognito and (after stale sessionStorage cleared) in normal browsers. Microsoft button verified with `scott.novis@outlook.com`.

**Resolution**
done · loginRedirect flow works end-to-end (popup approach abandoned); Azure platform config corrected to SPA

### 4. Update useAuth to handle both providers — reject

**Recommendation**
Update `useAuth` to handle both providers (normalize to one shape). Today it decodes a Google JWT for `{email, name, picture}`. Microsoft JWTs use `email` (or `preferred_username` fallback), `name`, and have no `picture` claim by default. Normalize to `{email, name, picture?}` regardless of issuer; persist to sessionStorage same as today.

**Discussion**
Already implemented as part of item 3's refactor. `userFromPayload` extracted to `src/lib/auth-storage.js` with the email = `payload.email || payload.preferred_username` fallback. useAuth imports and uses it. Verified working by Scott's successful Microsoft sign-in.

**Resolution**
reject · this is already done (delivered as part of the item 3 redirect-flow refactor)

### 5. Add VITE_MICROSOFT_CLIENT_ID to .env.example — done

**Recommendation**
Add `VITE_MICROSOFT_CLIENT_ID` to `.env.example` with a comment describing it as the Azure App Registration client ID (multi-tenant). Document alongside `VITE_GOOGLE_CLIENT_ID`.

**Discussion**
Added `VITE_MICROSOFT_CLIENT_ID` block with comments warning future deployers about the SPA-vs-Web platform trap (the AADSTS70002 client_secret rabbit hole). Also updated `VITE_GOOGLE_CLIENT_ID` and `ALLOWED_EMAILS` comments to reflect the new "either provider" semantics.

**Resolution**
done · documented in .env.example with SPA-platform warning to spare future deployers

### 6. Add osmedical.net users to ALLOWED_EMAILS — done

**Recommendation**
Add `tamara@osmedical.net` and `ben@osmedical.net` to `ALLOWED_EMAILS` (in production Vercel env vars and `.env` for local). They're the actual reason for this walk — Microsoft auth is the means.

**Discussion**
Updated Vercel `ALLOWED_EMAILS` via CLI rm + add; full list now: `scott@rymare.com,daniel@salesarcsolutions.com,scott.novis@outlook.com,tamara@osmedical.net,ben@osmedical.net`. Forced redeploy (`vercel deploy --prod`) so warm function instances cycle and pick up the new value. Verified via `vercel env pull`. Scope expanded from the original recommendation to also include `scott.novis@outlook.com` (operator/test access). Local `.env` parity is on Scott. Tamara/Ben's actual sign-in flow is not verified end-to-end here — neither I nor Scott can authenticate as them.

**Resolution**
done · Vercel allowlist updated and verified; tamara/ben sign-in to be confirmed by them on first use

## Flags

<!--
Amend-pass notes surface here when a resolution on one item affects another.
Format: `item N: why flagged · raised after item M resolved`.
Never auto-rewrites items; just a heads-up for when we get there.
-->

- item 2: scope expanded — also includes `npm uninstall google-auth-library` (deferred from item 1 to keep API working between items) · raised after item 1 resolved
- item 4: already implemented — `userFromPayload` was extracted to `src/lib/auth-storage.js` during the redirect-flow refactor; useAuth imports from there. Likely just needs marking done. · raised after item 3 resolved
- item 6: scope expanded — also include `scott.novis@outlook.com` (operator/test access; already added to Vercel `ALLOWED_EMAILS`); the original recommendation only listed tamara/ben · raised after item 3 resolved

## Summary

Added Microsoft Sign-In alongside the existing Google flow so osmedical.net users (tamara, ben) can access the dashboard. Net result: a unified auth pipeline — `jose` verifies both Google and Microsoft JWTs server-side; `@azure/msal-browser` issues Microsoft ID tokens client-side; `userFromPayload` normalizes both providers (with `email` falling back to `preferred_username` for Microsoft).

The walk took a major detour. The popup flow (`loginPopup`) couldn't close — the popup's callback URL was being stripped by ProtectedRoute's redirect to /login, so the parent never saw the auth code. Three speculative fixes failed in sequence (catch interaction_in_progress, init MSAL pre-React, render-null defense in ProtectedRoute) before pivoting to `loginRedirect`, which works cleanly. Required extracting MSAL into `src/lib/msal.js` and a new `src/lib/auth-storage.js` shared by useAuth and main.jsx. Also fought a separate Azure misconfiguration: the App Registration's redirect URI was under "Web" platform (per prior Claude Desktop guidance) instead of "Single-page application", causing `AADSTS70002` (must include client_secret). Scott flipped it; that unblocked sign-in.

Item 4 (useAuth normalize) was rejected as redundant — its work landed organically inside item 3's refactor. Item 6 scope expanded to include `scott.novis@outlook.com` (Scott's operator/test account). Side-fix shipped along the way: `vercel.json` SPA rewrite so direct `/login` navigation no longer 404s. The `.env.example` now documents the SPA-platform requirement so future deployers don't repeat the AADSTS70002 rabbit hole.

End-to-end Microsoft sign-in verified by Scott in production with `scott.novis@outlook.com`. Tamara and Ben's actual first sign-in is not yet observed — they'll confirm on first use.
