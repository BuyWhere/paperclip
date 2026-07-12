# OS-3244 front-door follow-up smoke

At: 2026-07-12T14:45:50.885Z
Base: https://8os.ai

- GET /login: 200 clerk=true legacyForm=false
- GET /signup: 200 clerk=true legacyForm=false
- GET /sign-in: 404 clerk=true legacyForm=false
- GET /signin: 404 clerk=true legacyForm=false
- GET /dashboard: 307 -> /login clerk=false legacyForm=false
- GET /onboarding: 307 -> /login clerk=false legacyForm=false
- POST /api/auth/login: 410 clerk=true legacyForm=false
- POST /api/auth/register: 410 clerk=true legacyForm=false
- GET /api/health: 200 clerk=false legacyForm=false
