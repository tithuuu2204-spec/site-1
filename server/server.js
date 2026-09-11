import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 8787);
const isProd = process.env.NODE_ENV === 'production';
const allowDemoFallback = process.env.ALLOW_DEMO_FALLBACK !== 'false';
const SESSION_SECRET = process.env.SESSION_SECRET || 'explore-hub-dev-only-change-me';

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const googleOAuthClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const hostedEvents = [];
let amadeusTokenCache = null;

function publicConfig() {
  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    googleMapId: process.env.GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    services: {
      ai: Boolean(process.env.OPENAI_API_KEY),
      googleSignIn: Boolean(process.env.GOOGLE_CLIENT_ID),
      maps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      calendar: Boolean(process.env.GOOGLE_CLIENT_ID),
      amadeus: Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET),
      payments: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    },
  };
}

function signSession(user) {
  return jwt.sign(user, SESSION_SECRET, { expiresIn: '7d' });
}

function readSession(req) {
  const token = req.cookies?.eh_session;
  if (!token) return null;
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch {
    return null;
  }
}

function jsonFromModelText(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error('AI returned an unexpected response format.');
  }
}

function normalizeTrip(trip, input) {
  const days = Math.max(1, Math.min(14, Number(input.days || 3)));
  const plan = Array.isArray(trip.plan) ? trip.plan.slice(0, days) : [];
  while (plan.length < days) {
    plan.push({
      day: plan.length + 1,
      title: 'Personalized exploration day',
      items: ['Morning attraction', 'Local lunch', 'Local experience', 'Evening leisure'],
    });
  }
  return {
    destination: trip.destination || input.destination,
    summary: trip.summary || `${days}-day trip planned for ${input.destination}.`,
    estimatedTotal: Number(trip.estimatedTotal || Math.max(6500, days * 4200 * Number(input.travelers || 1))),
    plan: plan.map((day, index) => ({
      day: Number(day.day || index + 1),
      title: day.title || `Day ${index + 1}`,
      items: Array.isArray(day.items) ? day.items.map(String).slice(0, 7) : [],
    })),
    notes: Array.isArray(trip.notes) ? trip.notes.map(String).slice(0, 5) : [],
  };
}

function demoTrip(input) {
  const destination = input.destination || 'Jaipur';
  const days = Math.max(1, Math.min(14, Number(input.days || 3)));
  const base = [
    [`Arrival & ${destination} discovery`, ['Arrival and hotel check-in', 'Lunch near the stay', 'Landmark or old-city walk', 'Evening local experience']],
    ['Culture, food & local places', ['Breakfast near the hotel', 'Major attraction in a lower-crowd time slot', 'Local market or food experience', 'Sunset point', 'Dinner nearby']],
    ['Relaxed exploration & return', ['Breakfast', 'Lesser-known attraction', 'Local business / souvenir stop', 'Transfer for return journey']],
  ];
  return {
    destination,
    summary: `${days}-day ${input.style || 'balanced'} trip for ${input.travelers || 2} traveler(s). Demo fallback is being used until the OpenAI key is configured.`,
    estimatedTotal: Math.max(6500, days * 4300 * Number(input.travelers || 2)),
    plan: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: base[i]?.[0] || 'Personalized exploration day',
      items: base[i]?.[1] || ['Morning attraction', 'Local lunch', 'Experience / activity', 'Evening leisure'],
    })),
    notes: ['Connect OPENAI_API_KEY in .env to replace this demo plan with live AI generation.'],
  };
}

async function amadeusToken() {
  if (!process.env.AMADEUS_CLIENT_ID || !process.env.AMADEUS_CLIENT_SECRET) return null;
  if (amadeusTokenCache && Date.now() < amadeusTokenCache.expiresAt) return amadeusTokenCache.token;
  const base = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.AMADEUS_CLIENT_ID,
    client_secret: process.env.AMADEUS_CLIENT_SECRET,
  });
  const response = await fetch(`${base}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`Amadeus authentication failed (${response.status}).`);
  const data = await response.json();
  amadeusTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 1800) - 60) * 1000,
  };
  return data.access_token;
}

async function amadeusFetch(endpoint, params = {}) {
  const token = await amadeusToken();
  if (!token) return null;
  const base = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
  const url = new URL(`${base}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Amadeus request failed (${response.status}): ${error.slice(0, 180)}`);
  }
  return response.json();
}

async function resolveIata(keyword) {
  const data = await amadeusFetch('/v1/reference-data/locations', {
    subType: 'CITY,AIRPORT',
    keyword: String(keyword || '').trim(),
    'page[limit]': 5,
    view: 'LIGHT',
  });
  const match = data?.data?.find((item) => item?.iataCode);
  return match?.iataCode || null;
}

async function liveTravelInventory(input) {
  if (!process.env.AMADEUS_CLIENT_ID || !process.env.AMADEUS_CLIENT_SECRET) return null;
  const originCode = await resolveIata(input.from);
  const destinationCode = await resolveIata(input.destination);
  if (!originCode || !destinationCode) throw new Error('Could not resolve airport/city codes for the selected route.');

  const departureDate = input.startDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const adults = Math.max(1, Math.min(9, Number(input.travelers || 1)));
  const flightData = await amadeusFetch('/v2/shopping/flight-offers', {
    originLocationCode: originCode,
    destinationLocationCode: destinationCode,
    departureDate,
    adults,
    currencyCode: 'INR',
    max: 4,
  });

  const flights = (flightData?.data || []).slice(0, 4).map((offer) => {
    const itinerary = offer.itineraries?.[0];
    const first = itinerary?.segments?.[0];
    const last = itinerary?.segments?.[itinerary.segments.length - 1];
    return {
      id: offer.id,
      carrier: first?.carrierCode || 'Airline',
      route: `${originCode} → ${destinationCode}`,
      departure: first?.departure?.at || '',
      arrival: last?.arrival?.at || '',
      duration: itinerary?.duration || '',
      price: Number(offer.price?.grandTotal || offer.price?.total || 0),
      currency: offer.price?.currency || 'INR',
      source: 'Amadeus',
    };
  });

  let hotels = [];
  try {
    const hotelList = await amadeusFetch('/v1/reference-data/locations/hotels/by-city', {
      cityCode: destinationCode,
      radius: 20,
      radiusUnit: 'KM',
      hotelSource: 'ALL',
    });
    const hotelIds = (hotelList?.data || []).slice(0, 8).map((hotel) => hotel.hotelId).filter(Boolean);
    if (hotelIds.length) {
      const checkOutDate = new Date(`${departureDate}T00:00:00`);
      checkOutDate.setDate(checkOutDate.getDate() + Math.max(1, Number(input.days || 1)));
      const offers = await amadeusFetch('/v3/shopping/hotel-offers', {
        hotelIds: hotelIds.join(','),
        adults,
        checkInDate: departureDate,
        checkOutDate: checkOutDate.toISOString().slice(0, 10),
        roomQuantity: 1,
        currency: 'INR',
        bestRateOnly: true,
      });
      hotels = (offers?.data || []).slice(0, 5).map((item) => ({
        id: item.hotel?.hotelId,
        name: item.hotel?.name || 'Hotel',
        cityCode: item.hotel?.cityCode || destinationCode,
        price: Number(item.offers?.[0]?.price?.total || 0),
        currency: item.offers?.[0]?.price?.currency || 'INR',
        available: item.available !== false,
        source: 'Amadeus',
      }));
    }
  } catch (error) {
    console.warn('Hotel inventory unavailable:', error.message);
  }

  return { configured: true, source: 'Amadeus', originCode, destinationCode, flights, hotels };
}

function demoInventory(input) {
  const destination = input.destination || 'Jaipur';
  return {
    configured: false,
    source: 'Demo',
    flights: [
      { carrier: 'Demo Airline', route: `${input.from || 'Home'} → ${destination}`, departure: '07:10', arrival: '08:45', price: 5399, currency: 'INR', source: 'Demo' },
      { carrier: 'Demo Airline 2', route: `${input.from || 'Home'} → ${destination}`, departure: '11:20', arrival: '13:05', price: 6240, currency: 'INR', source: 'Demo' },
    ],
    hotels: [
      { name: 'Central Boutique Stay', price: 2850, currency: 'INR', available: true, source: 'Demo' },
      { name: 'Traveler Comfort Hotel', price: 2100, currency: 'INR', available: true, source: 'Demo' },
    ],
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Explore Hub API', time: new Date().toISOString() }));
app.get('/api/config', (_req, res) => res.json(publicConfig()));

app.post('/api/auth/google', async (req, res) => {
  if (!googleOAuthClient || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google Sign-In is not configured. Add GOOGLE_CLIENT_ID to .env.' });
  }
  const credential = req.body?.credential;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error('Invalid Google account payload.');
    const user = {
      sub: payload.sub,
      name: payload.name || payload.given_name || 'Traveler',
      email: payload.email || '',
      picture: payload.picture || '',
    };
    res.cookie('eh_session', signSession(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true, user });
  } catch (error) {
    return res.status(401).json({ error: `Google sign-in failed: ${error.message}` });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ user: null });
  return res.json({ user });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('eh_session');
  res.json({ ok: true });
});

app.post('/api/travel/search', async (req, res) => {
  try {
    const live = await liveTravelInventory(req.body || {});
    if (live) return res.json(live);
    if (allowDemoFallback) return res.json(demoInventory(req.body || {}));
    return res.status(503).json({ error: 'Travel API is not configured. Add Amadeus credentials to .env.' });
  } catch (error) {
    if (allowDemoFallback) return res.json({ ...demoInventory(req.body || {}), warning: error.message });
    return res.status(502).json({ error: error.message });
  }
});

app.post('/api/ai/trip', async (req, res) => {
  const input = req.body || {};
  if (!input.destination) return res.status(400).json({ error: 'Destination is required.' });

  let inventory = null;
  try {
    inventory = await liveTravelInventory(input);
  } catch (error) {
    console.warn('AI planner travel inventory warning:', error.message);
  }

  if (!openai) {
    if (allowDemoFallback) return res.json({ trip: demoTrip(input), source: 'demo', inventory: inventory || demoInventory(input) });
    return res.status(503).json({ error: 'AI is not configured. Add OPENAI_API_KEY to .env.' });
  }

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-6-astra';
    const response = await openai.responses.create({
      model,
      reasoning: { effort: 'low' },
      instructions: [
        'You are the Explore Hub trip-planning engine for tourism in India.',
        'Create practical, family-friendly, geographically sensible itineraries.',
        'Prefer authentic local experiences, local businesses, sensible travel time, and less crowded time slots where possible.',
        'Never claim a hotel, flight, restaurant, event, price, crowd level, or booking is live/confirmed unless it appears in supplied live inventory.',
        'Return ONLY valid JSON. No Markdown, no code fences, no commentary.',
        'JSON shape: {"destination":"string","summary":"string","estimatedTotal":number,"plan":[{"day":number,"title":"string","items":["string"]}],"notes":["string"]}.',
        'The plan array must contain exactly the requested number of days. Keep 4-6 concise items per day.',
      ].join(' '),
      input: JSON.stringify({
        tripRequest: {
          from: input.from,
          destination: input.destination,
          startDate: input.startDate,
          days: Number(input.days || 3),
          travelers: Number(input.travelers || 2),
          budget: input.budget,
          style: input.style,
        },
        liveTravelInventory: inventory || 'Not configured. Make planning suggestions without claiming live availability.',
      }),
    });
    const parsed = jsonFromModelText(response.output_text);
    return res.json({
      trip: normalizeTrip(parsed, input),
      source: 'openai',
      model,
      inventory: inventory || (allowDemoFallback ? demoInventory(input) : null),
    });
  } catch (error) {
    console.error('OpenAI planner error:', error);
    if (allowDemoFallback) {
      return res.json({
        trip: demoTrip(input),
        source: 'demo',
        warning: `Live AI failed: ${error.message}`,
        inventory: inventory || demoInventory(input),
      });
    }
    return res.status(502).json({ error: `AI trip generation failed: ${error.message}` });
  }
});

app.post('/api/host/verify', async (req, res) => {
  const { legalName, gstin, consent } = req.body || {};
  if (!legalName || !gstin || !consent) return res.status(400).json({ error: 'Legal name, GSTIN and consent are required.' });
  // This is intentionally NOT an Aadhaar verification endpoint. Connect an authorized KYC provider here.
  res.json({
    ok: true,
    verificationId: `KYC-${Date.now()}`,
    gstVerified: false,
    identityVerified: false,
    status: 'provider_required',
    message: 'Host details received. Connect your permitted GST/KYC provider before treating this as verified.',
  });
});

app.post('/api/events', (req, res) => {
  const event = {
    id: `EVT-${Date.now()}`,
    ...req.body,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
  };
  hostedEvents.unshift(event);
  res.status(201).json({ ok: true, event });
});

app.get('/api/events/hosted', (_req, res) => res.json({ events: hostedEvents }));

app.post('/api/payments/order', async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.' });
  }
  const amountRupees = Math.max(1, Number(req.body?.amount || 0));
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        currency: 'INR',
        receipt: `explorehub_${Date.now()}`,
        notes: { project: 'Explore Hub' },
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.description || 'Payment order creation failed.' });
    return res.json({ keyId: process.env.RAZORPAY_KEY_ID, order: data });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

if (isProd && fs.existsSync(path.join(ROOT, 'dist'))) {
  app.use(express.static(path.join(ROOT, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
}

app.listen(PORT, () => {
  const cfg = publicConfig();
  console.log(`\nExplore Hub API running at http://localhost:${PORT}`);
  console.log(`AI: ${cfg.services.ai ? 'configured' : 'needs OPENAI_API_KEY'}`);
  console.log(`Google Sign-In: ${cfg.services.googleSignIn ? 'configured' : 'needs GOOGLE_CLIENT_ID'}`);
  console.log(`Google Maps: ${cfg.services.maps ? 'configured' : 'needs GOOGLE_MAPS_API_KEY'}`);
  console.log(`Amadeus travel: ${cfg.services.amadeus ? 'configured' : 'optional / demo fallback'}`);
  console.log(`Razorpay: ${cfg.services.payments ? 'configured' : 'optional'}\n`);
});
