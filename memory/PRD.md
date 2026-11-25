# ROTA SEGURA — PRD

## Original problem statement
"Quero que você abra e execute meu projeto atual diretamente em modo Mobile, utilizando o próprio ambiente do Emergent" → then "pode continuar e fazer os ajustes" (user picked: e-mails de recuperação, login com Google, pagamento dos planos premium, compartilhar rota no WhatsApp).

## Architecture
Expo SDK 58 (expo-router) + FastAPI + MongoDB. JWT auth (app token). Integrations: Emergent managed email (Resend proxy), Emergent-managed Google Auth (session_id → /api/auth/session → app JWT), Stripe Checkout (needs STRIPE_API_KEY).

## Implemented
- 2026-06: Environment set up (.env files, deps) and app running in preview/Expo Go.
- 2026-06: Password reset e-mail via Emergent email; link now https `/api/public/reset-password` page with form (works without the app).
- 2026-06: Google login via Emergent (web + native), creates account if new.
- 2026-06: "Enviar pelo WhatsApp" button on live location share.
- 2026-06: Fixes: naive datetime crash in reset request; active share visible without location permission; Google web error shown on login.

## Backlog
- P0: Add STRIPE_API_KEY (and STRIPE_WEBHOOK_SECRET) to enable real premium payments.
- P1: Background location updates (native build), store google `sub` instead of email.
- P2: Split server.py, separate loading spinners on login buttons.
