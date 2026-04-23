# Vercel Project Naming and Rename Procedure

Written: 2026-04-23 15:27 · Context at save: ~38%
Branch: main · Commit: 33ac890

## Content

Yeah, that's purely cosmetic scar tissue — the handoff flagged it. When you ran `vercel dev` for the first local full-stack test on 2026-04-22, the CLI prompted to link/create a project, and the default it suggested was `dasharc-local` (because the local folder is `dasharc-local` or the link template appended `-local`). Rather than blow away the link and restart, we kept the name and deployed through it. Just a default that stuck.

Renaming is low effort but has one real gotcha — the OAuth origin. Here's what's involved:

**The rename itself** (Vercel dashboard, ~1 min):
- Project Settings → General → Project Name: `dasharc-local` → `dasharc`
- Production URL flips to `https://dasharc.vercel.app` (assuming it's not already claimed by someone on Vercel — Vercel will tell you if there's a conflict)

**The gotcha — Google OAuth origins:**
- The OAuth client currently lists `https://dasharc-local.vercel.app` as an authorized JavaScript origin.
- Rename without updating this → sign-in breaks immediately (Google rejects the origin).
- Fix: add `https://dasharc.vercel.app` to authorized origins in Google Cloud Console **before** cutover. Leave the old one in too until you're sure nobody (read: Daniel) has the old URL bookmarked; remove it a week later.

**Other notes:**
- Vercel typically keeps the old `*.vercel.app` as an alias/redirect for a while, but don't count on it — treat it as dead and tell Daniel the new URL.
- No code changes needed. No env var changes. No redeploy needed — the rename just remaps the domain.

**Want a cleaner path long-term?** A custom domain like `dashboard.salesarc.com` (or whatever the agency owns) would outlive any Vercel-project naming weirdness and look more professional to clients. That's a separate decision with DNS work.

For the rename itself, I can't do it from CLI — it's a dashboard action.
