# LexiCore V7/V7.1 completion

This tree completes the three previously open commercialization items while leaving the V6.12.2 reasoning core unchanged.

## Desktop V7
- Electron shell + NSIS packaging in `desktop-electron/`.
- Loopback server is started by Electron on `127.0.0.1` with a random free port and `LEXICORE_RUNTIME_MODE=desktop`.
- Existing offline activation UI is wired to the real Ed25519 device-bound license store.
- Build entry point: `build_desktop_v7.bat`.
- Expected artifact: `dist/installer-electron/LexiCore-Desktop-Setup-v7.0.exe`.

## server.ts licensing integration
- `LEXICORE_RUNTIME_MODE=desktop`: Desktop license routes are public, then all remaining `/api` routes are gated by `requireDesktopLicense()`.
- `LEXICORE_RUNTIME_MODE=web`: session parsing runs first, auth/license/payment routes stay reachable, then remaining `/api` routes are gated by `requireActiveSubscription()`.
- `LEXICORE_RUNTIME_MODE=off`: preserves the internal/frozen baseline behavior.
- `/api/live`, `/api/ready`, `/api/health`, `/api/runtime`, and `/api/ai/status` are registered before commercial gates.

## Web V7.1
- File-backed account store with scrypt password hashing and atomic writes.
- HMAC-signed HttpOnly/SameSite=Strict session cookie fills `req.customerId`.
- Register/login/logout/me endpoints under `/api/auth`.
- Midtrans Snap checkout under `/api/license/checkout`.
- Signed webhook under `/api/license/payment-webhook`; signature is verified and transaction status is re-checked against Midtrans before granting a subscription.
- Webhook is idempotent by order id.
- `dev-mock-pay` is removed.

Production Web requires HTTPS, a strong `LEXICORE_SESSION_SECRET`, `MIDTRANS_SERVER_KEY`, real prices, and `LEXICORE_PRICING_CONFIRMED=1`.
