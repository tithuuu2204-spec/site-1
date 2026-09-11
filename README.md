# Explore Hub – API-Connected Smart Tourism Platform

Explore Hub is a React + Vite frontend with a Node/Express backend. The project now contains real integration code for the main services needed by the tourism concept while keeping a demo fallback so the SIH prototype still runs before every external key is configured.

## What is connected

- **OpenAI Responses API** – server-side AI trip generation (main planner)
- **Google Sign-In** – Google Identity Services in the browser + ID-token verification on the server
- **Google Maps Platform** – Maps JavaScript API + Routes library for route drawing
- **Google Places** – live hotel/restaurant discovery around a destination
- **Google Calendar** – user-authorized trip events added to the user's calendar
- **Amadeus Self-Service APIs** – optional live flight offers and hotel offers
- **Razorpay** – optional server-created checkout orders (use test keys for the project)
- **Explore Hub backend** – host-verification handoff endpoint and event-submission endpoint

## Important: API keys are not included

External API providers issue keys to your own accounts/projects. Never paste secret keys into `src/` files or upload `.env` to GitHub.

## 1. Install and run

Open PowerShell inside this folder (the folder containing `package.json`) and run:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

`npm run dev` starts both:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

The Vite dev server automatically proxies `/api/*` to the backend.

## 2. AI FIRST – OpenAI

In `.env`:

```env
OPENAI_API_KEY=sk-your-real-key
OPENAI_MODEL=gpt-6-astra
```

The secret is used only by `server/server.js`. The browser calls `/api/ai/trip`; it never receives the OpenAI key.

If the key is absent, the planner clearly shows **DEMO FALLBACK**. Once the key is present and valid, the result badge shows **LIVE AI**.

## 3. Google Sign-In

Create a Google Cloud project and an OAuth 2.0 **Web application** client. For local development add this JavaScript origin:

```text
http://localhost:5173
```

Then set:

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

The frontend receives a Google ID token, sends it to `/api/auth/google`, and the backend verifies it before creating an HTTP-only Explore Hub session cookie.

## 4. Google Maps + Places + Routes

In the same Google Cloud project enable:

- Maps JavaScript API
- Places API (New)
- Routes API

Create a browser API key and restrict it to your website origins / HTTP referrers and only the APIs the project uses.

Set:

```env
GOOGLE_MAPS_API_KEY=your-browser-maps-key
GOOGLE_MAP_ID=DEMO_MAP_ID
```

For deployment, replace/refine the allowed referrer with your deployed domain.

The AI result page now draws the trip route and uses Google Places to show real nearby hotels and restaurants.

## 5. Google Calendar

Enable **Google Calendar API** in the Google Cloud project. The site requests the `calendar.events` OAuth scope only when the user clicks **Add to Calendar**.

The same `GOOGLE_CLIENT_ID` is used. During development, add your test Google accounts to the OAuth consent screen if the app is still in testing mode.

## 6. Flights + hotels – Amadeus

Create an Amadeus for Developers Self-Service app and add its test credentials:

```env
AMADEUS_BASE_URL=https://test.api.amadeus.com
AMADEUS_CLIENT_ID=your-amadeus-api-key
AMADEUS_CLIENT_SECRET=your-amadeus-api-secret
```

Explore Hub resolves city/airport codes, searches flight offers, fetches destination hotels, then requests hotel offers. If Amadeus is not configured or its test inventory has no result, the UI uses labeled demo inventory instead of pretending it is live.

## 7. Payments – Razorpay (optional)

For the hackathon/demo use **test mode** keys only:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=your-test-secret
```

The backend creates the order; the secret never goes to the browser. Before any production use you must also implement server-side payment-signature verification and a real booking/fulfilment workflow.

## 8. Host GST / identity verification

`/api/host/verify` is intentionally a **provider handoff**, not fake verification. It does not collect or validate raw Aadhaar numbers and does not claim the host is verified. Connect a legally permitted KYC/GST provider in this server endpoint after your team chooses one and completes its onboarding requirements.

## 9. Crowd intelligence

The Crowd Insights screen is still explicitly labeled as a **demo heatmap**. A real crowd system should be built from legitimate signals your project has rights to use, such as Explore Hub booking counts, venue/ticketing feeds, mobility/footfall partnerships, event schedules, and traffic data. Do not scrape or claim Google "popular times" as a live official crowd API.

## Main project files

```text
Explore-Hub-API-Connected/
├── .env.example
├── package.json
├── vite.config.js
├── server/
│   └── server.js
└── src/
    ├── App.jsx
    ├── services.js
    ├── integrations.js
    ├── data.js
    ├── main.jsx
    └── styles.css
```

## Production build

```powershell
npm run build
```

For a real deployment, set `NODE_ENV=production`, configure the environment variables on the hosting platform, and run:

```powershell
npm start
```

For production, replace the in-memory event store with PostgreSQL/PostGIS, add authorization roles, server-side payment verification, booking records, media storage, rate limiting, audit logs, monitoring, and your approved KYC/GST provider.
