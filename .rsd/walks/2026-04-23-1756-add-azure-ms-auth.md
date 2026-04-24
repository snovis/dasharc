# Walk: add-azure-ms-auth

Started: 2026-04-23 17:56 · Branch: main · Start commit: 0edda22
Status: in progress
Totals: 6 items · 0 done · 0 rejected · 0 deferred · 0 modified · 6 unresolved

<!--
A walk is a living tasklist. Items are resolved one at a time via /rsd:next.
After each resolution, remaining items may be flagged for re-check if the fix
affected them. Flags are surfaced in chat and recorded inline, not auto-edited.
-->

## Items

### 1. Install deps — unresolved

**Recommendation**
`npm install @azure/msal-browser jose` (and remove `google-auth-library`). One generic JWT library (`jose`) verifies both Google and Microsoft tokens server-side; `@azure/msal-browser` issues Microsoft ID tokens client-side. Library swap; Google sign-in remains fully supported.

**Discussion**

**Resolution**

### 2. Refactor verify-token.js for both providers — unresolved

**Recommendation**
Refactor `api/_lib/verify-token.js` to verify both Google + Microsoft JWTs via `jose`. Read the `iss` claim → pick the right JWKs URL (Google: `https://www.googleapis.com/oauth2/v3/certs`, Microsoft: `https://login.microsoftonline.com/common/discovery/v2.0/keys`) and audience (Google client ID or Microsoft client ID) → verify. `ALLOWED_EMAILS` check applies after, unchanged.

**Discussion**

**Resolution**

### 3. Add MSAL.js + Microsoft sign-in button to LoginPage — unresolved

**Recommendation**
Add MSAL.js setup + a "Sign in with Microsoft" button to `LoginPage.jsx`. Initialize `PublicClientApplication` with the multi-tenant authority and `VITE_MICROSOFT_CLIENT_ID`. Trigger interactive sign-in (`loginPopup` or `loginRedirect`); on success, hand the ID token to `useAuth().signIn(token)`.

**Discussion**

**Resolution**

### 4. Update useAuth to handle both providers — unresolved

**Recommendation**
Update `useAuth` to handle both providers (normalize to one shape). Today it decodes a Google JWT for `{email, name, picture}`. Microsoft JWTs use `email` (or `preferred_username` fallback), `name`, and have no `picture` claim by default. Normalize to `{email, name, picture?}` regardless of issuer; persist to sessionStorage same as today.

**Discussion**

**Resolution**

### 5. Add VITE_MICROSOFT_CLIENT_ID to .env.example — unresolved

**Recommendation**
Add `VITE_MICROSOFT_CLIENT_ID` to `.env.example` with a comment describing it as the Azure App Registration client ID (multi-tenant). Document alongside `VITE_GOOGLE_CLIENT_ID`.

**Discussion**

**Resolution**

### 6. Add osmedical.net users to ALLOWED_EMAILS — unresolved

**Recommendation**
Add `tamara@osmedical.net` and `ben@osmedical.net` to `ALLOWED_EMAILS` (in production Vercel env vars and `.env` for local). They're the actual reason for this walk — Microsoft auth is the means.

**Discussion**

**Resolution**

## Flags

<!--
Amend-pass notes surface here when a resolution on one item affects another.
Format: `item N: why flagged · raised after item M resolved`.
Never auto-rewrites items; just a heads-up for when we get there.
-->

## Summary

<!-- Written by /rsd:walk-done. Empty while the walk is in progress. -->
