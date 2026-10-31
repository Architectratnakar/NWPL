# Frontend — MLM Portal Web App

React 18 + TypeScript · Vite · Tailwind CSS v4 · TanStack Query · React Router · Recharts

## Run

The Backend must be running on port 4000 first.

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server forwards `/api/*` to the Backend (`BACKEND_URL` in `.env`, default `http://localhost:4000`).

## Build for production

```bash
npm run build      # output in dist/
```

You can deploy it in either of two ways:
1. **Same server:** the Backend serves `Frontend/dist` automatically when it exists, so run `npm start` in Backend.
2. **Separate hosting** (Netlify, S3+CloudFront, nginx): set `VITE_API_URL=https://api.your-domain.com/api/v1` before `npm run build`. In `Backend/.env`, set `WEB_ORIGIN` to the Frontend address and `COOKIE_SAMESITE=none` (HTTPS required).

## Folder layout

```
Frontend/
├── index.html
├── vite.config.ts         dev server + /api proxy
├── public/brand/          logo, favicon, plan slides, price list
└── src/
    ├── main.tsx  App.tsx  routes, providers, role-based guards
    ├── index.css          theme (brand colours, fonts)
    ├── api/client.ts      axios client, automatic token refresh
    ├── auth/              session (login, logout, roles)
    ├── i18n/              English / हिंदी
    ├── lib/               formatting (₹, dates, BV), hooks
    ├── components/        UI kit, layout & sidebar, binary tree, ticket thread
    └── pages/
        ├── auth/          Login (logo + slides), Register, Forgot password
        ├── member/        Dashboard, Activate, Shop, Orders, Genealogy, Team, Income, Wallet, Ranks, KYC, Profile, Support, Plan
        └── admin/         Dashboard, Members, Users, KYC, Commerce (products, packages, orders, returns), Finance (closings, withdrawals, ranks, reports), System (settings, tickets, audit)
```
