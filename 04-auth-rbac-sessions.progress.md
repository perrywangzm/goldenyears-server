# Plan 04 Progress

## Status

Implemented with Supabase Auth as the identity provider and Golden Years app sessions as the browser session layer.

## Implemented

- `user/auth/login`, `user/auth/logout`, `user/auth/signup`, password reset, and verification resend endpoints, with legacy flat session aliases.
- Supabase Auth credential verification behind a Worker-only adapter; dev/test fallback uses seed password hashes when Supabase env is absent.
- `users.auth_user_id` links Supabase `auth.users(id)` to app-owned `users.id`.
- Identity provisioning resolves by `auth_user_id`, links legacy email-only users, or creates app profiles.
- HTTP-only Secure SameSite audience session cookies plus non-HTTP-only CSRF cookies for double-submit checks.
- Session lookup middleware deriving actor context server-side from the cookie.
- `get_me` returns safe user, roles, and account/nav counts.
- Partner and admin audience gates remain backend-owned.
- Body actor/user fields are ignored by services; actor is derived from request context.

## BDD Coverage

- Login creates secure cookies and `get_me` returns safe family context.
- Supabase identity provisioning covers auth-user-id lookup, email linking, and new profile creation.
- Body identity fields cannot impersonate another user.
- Cookie-authenticated mutations require a CSRF header matching the CSRF cookie.

## Deferred

- No social auth.
- No browser-managed Supabase sessions or frontend Supabase SDK.
- No MFA enforcement yet.
- Admin login route still pending beyond authorization policies.
