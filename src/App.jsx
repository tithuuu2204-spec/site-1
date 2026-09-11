import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, MapPin, CalendarDays, Users, Sparkles, ShieldCheck, Star,
  ArrowRight, Check, Plane, Hotel, Car, Utensils, Navigation,
  BarChart3, PlusCircle, X, Clock3, IndianRupee, Camera, Upload,
  BadgeCheck, Map, Route, WalletCards, ChevronRight, Menu, SlidersHorizontal,
} from 'lucide-react';
import { EVENTS, DESTINATIONS, NEARBY } from './data.js';
import {
  buildAITrip, createHostedEvent, verifyHost, getPublicConfig, getCurrentUser,
  signInWithGoogle, signOut, createPaymentOrder,
} from './services.js';
import {
  loadGoogleIdentity, drawGoogleRoute, searchGooglePlaces,
  addTripToGoogleCalendar, loadRazorpay,
} from './integrations.js';

const categories = ['All', 'Culture', 'Heritage', 'Food', 'Adventure', 'Nature', 'Road Trip'];

export default function App() {
  const [page, setPage] = useState('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [toast, setToast] = useState('');
  const [config, setConfig] = useState({ services: {} });
  const [user, setUser] = useState(null);

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => {});
    getCurrentUser().then(setUser).catch(() => {});
  }, []);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const filtered = useMemo(() => EVENTS.filter((event) => {
    const haystack = `${event.title} ${event.city} ${event.state} ${event.category}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === 'All' || event.category === category);
  }), [query, category]);

  const navigate = (next) => {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <Navbar page={page} navigate={navigate} mobileNav={mobileNav} setMobileNav={setMobileNav} config={config} user={user} setUser={setUser} showToast={showToast} />

      {page === 'home' && <Home navigate={navigate} setQuery={setQuery} setSelectedEvent={setSelectedEvent} />}
      {page === 'explore' && <Explore events={filtered} query={query} setQuery={setQuery} category={category} setCategory={setCategory} setSelectedEvent={setSelectedEvent} />}
      {page === 'planner' && <Planner showToast={showToast} config={config} />}
      {page === 'crowd' && <CrowdInsights />}
      {page === 'host' && <HostEvent showToast={showToast} navigate={navigate} />}

      <Footer navigate={navigate} />
      {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} showToast={showToast} navigate={navigate} config={config} />}
      {toast && <div className="toast"><Check size={18} /> {toast}</div>}
    </div>
  );
}

function Navbar({ page, navigate, mobileNav, setMobileNav, config, user, setUser, showToast }) {
  const links = [
    ['home', 'Home'], ['explore', 'Explore'], ['planner', 'AI Trip Planner'], ['crowd', 'Crowd Insights'], ['host', 'Host an Event'],
  ];
  const logout = async () => {
    try {
      await signOut();
      window.google?.accounts?.id?.disableAutoSelect?.();
      setUser(null);
      showToast('Signed out');
    } catch (error) {
      showToast(error.message);
    }
  };
  return (
    <header className="nav-wrap">
      <nav className="navbar container">
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark"><Navigation size={21} /></span>
          <span>Explore <span>Hub</span></span>
        </button>
        <div className={`nav-links ${mobileNav ? 'open' : ''}`}>
          {links.map(([id, label]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>{label}</button>
          ))}
        </div>
        <div className="nav-actions">
          {user ? (
            <button className="user-pill hide-mobile" onClick={logout} title="Click to sign out">
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{user.name?.[0] || 'U'}</span>}
              <b>{user.name?.split(' ')[0] || 'Traveler'}</b>
            </button>
          ) : <GoogleSignInButton config={config} setUser={setUser} showToast={showToast} />}
          <button className="btn btn-primary hide-mobile" onClick={() => navigate('planner')}><Sparkles size={17} /> Plan my trip</button>
          <button className="icon-btn menu-btn" onClick={() => setMobileNav((v) => !v)}><Menu /></button>
        </div>
      </nav>
    </header>
  );
}

function GoogleSignInButton({ config, setUser, showToast }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!config.googleClientId || !buttonRef.current) return;
    let cancelled = false;
    loadGoogleIdentity().then(() => {
      if (cancelled || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async ({ credential }) => {
          try {
            const result = await signInWithGoogle(credential);
            setUser(result.user);
            showToast(`Welcome, ${result.user.name?.split(' ')[0] || 'traveler'}!`);
          } catch (error) {
            showToast(error.message);
          }
        },
      });
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 118,
      });
    }).catch(() => showToast('Could not load Google Sign-In'));
    return () => { cancelled = true; };
  }, [config.googleClientId]);

  if (!config.googleClientId) {
    return <button className="btn btn-ghost hide-mobile" onClick={() => showToast('Add GOOGLE_CLIENT_ID to .env to enable Google Sign-In')}>Sign in</button>;
  }
  return <div className="google-signin hide-mobile" ref={buttonRef} />;
}

function Home({ navigate, setQuery, setSelectedEvent }) {
  const [heroQuery, setHeroQuery] = useState('');
  return (
    <main>
      <section className="hero">
        <div className="hero-overlay" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={16} /> AI-powered local travel</div>
            <h1>Travel beyond places.<br /><span>Experience the real India.</span></h1>
            <p>Discover verified local events, build complete AI-powered trips, compare crowd levels and book your journey in a few clicks.</p>
            <div className="hero-search">
              <MapPin />
              <input value={heroQuery} onChange={(e) => setHeroQuery(e.target.value)} placeholder="Where do you want to go?" />
              <button onClick={() => { setQuery(heroQuery); navigate('explore'); }}><Search size={18} /> Explore</button>
            </div>
            <div className="hero-trust">
              <span><ShieldCheck /> Verified hosts</span>
              <span><Route /> AI itineraries</span>
              <span><BarChart3 /> Crowd insights</span>
            </div>
          </div>
          <div className="floating-trip-card">
            <div className="trip-card-top"><span>AI Smart Trip</span><Sparkles size={18} /></div>
            <h3>Ahmedabad Culture Weekend</h3>
            <div className="mini-route">
              <div><span>01</span><p><b>Airport pickup</b><small>09:00 · Cab ready</small></p></div>
              <div><span>02</span><p><b>Hotel check-in</b><small>10:15 · 4.6 ★ stay</small></p></div>
              <div><span>03</span><p><b>Heritage + food</b><small>14:00 · Low crowd</small></p></div>
              <div><span>04</span><p><b>Garba event</b><small>19:30 · Verified host</small></p></div>
            </div>
            <button className="trip-cta" onClick={() => navigate('planner')}>Build my trip <ArrowRight size={17} /></button>
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="container stats-grid">
          <div><b>2,500+</b><span>Verified experiences</span></div>
          <div><b>120+</b><span>Indian destinations</span></div>
          <div><b>35k+</b><span>Trips planned</span></div>
          <div><b>4.8/5</b><span>Traveler rating</span></div>
        </div>
      </section>

      <section className="section container">
        <SectionHead kicker="TRENDING NOW" title="Popular experiences travelers love" action="View all" onAction={() => navigate('explore')} />
        <div className="event-grid">
          {EVENTS.slice(0, 4).map((event) => <EventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />)}
        </div>
      </section>

      <section className="section soft-section">
        <div className="container">
          <SectionHead kicker="SMARTER PLANNING" title="One platform. Your entire journey." subtitle="Explore Hub combines local experiences and mainstream travel services into one intelligent itinerary." />
          <div className="feature-grid">
            <Feature icon={<BadgeCheck />} title="Verified local hosts" text="Host verification, event details, reviews and trust indicators help reduce fraudulent listings." />
            <Feature icon={<Sparkles />} title="AI trip builder" text="Enter your destination, budget and dates. AI combines experiences, hotels, food, cabs and travel into a day-by-day plan." />
            <Feature icon={<Map />} title="Maps & route intelligence" text="Optimize routes from your location to the destination and between every stop in the itinerary." />
            <Feature icon={<BarChart3 />} title="Crowd intelligence" text="Compare busy and calmer areas so travelers can choose better time slots and discover alternatives." />
          </div>
        </div>
      </section>

      <section className="section container split-cta">
        <div>
          <div className="eyebrow dark"><PlusCircle size={16} /> For local organizers</div>
          <h2>Turn local experiences into bookable tourism.</h2>
          <p>List cultural events, workshops, road trips, private-land experiences, village activities and other authentic local experiences.</p>
          <button className="btn btn-primary large" onClick={() => navigate('host')}>Become a host <ArrowRight size={18} /></button>
        </div>
        <div className="host-preview">
          <div className="verification-pill"><ShieldCheck size={18} /> Host verification</div>
          <h3>Safer listings through verified identity and business checks</h3>
          <div className="verify-row"><Check /> GSTIN / business verification</div>
          <div className="verify-row"><Check /> Identity verification through compliant KYC flow</div>
          <div className="verify-row"><Check /> Event location, capacity, rules and media</div>
          <div className="verify-row"><Check /> Ratings, booking history and reporting</div>
        </div>
      </section>
    </main>
  );
}

function Explore({ events, query, setQuery, category, setCategory, setSelectedEvent }) {
  return (
    <main className="page-main">
      <section className="page-hero compact">
        <div className="container">
          <div className="eyebrow dark"><MapPin size={16} /> Explore India</div>
          <h1>Discover authentic local experiences</h1>
          <p>Search culture, heritage, food, road trips, nature and community-hosted experiences.</p>
          <div className="search-panel">
            <div className="input-shell"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search city, event or state" /></div>
            <button className="btn btn-dark"><SlidersHorizontal size={17} /> Filters</button>
          </div>
          <div className="category-tabs">
            {categories.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="result-row"><p><b>{events.length}</b> experiences found</p><select><option>Most popular</option><option>Top rated</option><option>Price: low to high</option><option>Lowest crowd</option></select></div>
        <div className="event-grid">
          {events.map((event) => <EventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />)}
        </div>
        {events.length === 0 && <div className="empty-state"><Search size={36} /><h3>No experiences found</h3><p>Try a different city, category or keyword.</p></div>}
      </section>
    </main>
  );
}

function Planner({ showToast, config }) {
  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);
  const [form, setForm] = useState({
    from: 'Ahmedabad', destination: 'Jaipur', startDate: defaultDate,
    days: 3, travelers: 2, budget: '₹25,000 – ₹45,000', style: 'balanced',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await buildAITrip(form);
      setResult(data);
      if (data.warning) showToast(data.warning);
    } catch (err) {
      setError(err.message);
      showToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-main planner-page">
      <section className="page-hero planner-hero">
        <div className="container planner-heading">
          <div className="eyebrow"><Sparkles size={16} /> Explore Hub AI</div>
          <h1>Your entire trip, intelligently planned.</h1>
          <p>Live AI can combine transport inventory, stays, local discovery, Google routes and crowd-aware timing into one plan.</p>
          <div className="service-status-row">
            <ServiceChip active={config.services?.ai} label="OpenAI" />
            <ServiceChip active={config.services?.maps} label="Google Maps" />
            <ServiceChip active={config.services?.amadeus} label="Flights + Hotels" />
            <ServiceChip active={config.services?.calendar} label="Google Calendar" />
          </div>
        </div>
      </section>
      <section className="container planner-layout">
        <div className="planner-form card">
          <h2>Tell us about your trip</h2>
          <div className="form-grid two">
            <Field label="Starting from" icon={<Navigation />}><input value={form.from} onChange={(e) => update('from', e.target.value)} placeholder="Ahmedabad" /></Field>
            <Field label="Destination" icon={<MapPin />}><input value={form.destination} onChange={(e) => update('destination', e.target.value)} placeholder="Jaipur" /></Field>
            <Field label="Start date" icon={<CalendarDays />}><input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} /></Field>
            <Field label="Number of days" icon={<CalendarDays />}><input type="number" min="1" max="14" value={form.days} onChange={(e) => update('days', e.target.value)} /></Field>
            <Field label="Travelers" icon={<Users />}><input type="number" min="1" max="9" value={form.travelers} onChange={(e) => update('travelers', e.target.value)} /></Field>
          </div>
          <label className="label">Budget range</label>
          <div className="choice-row">
            {['Under ₹25,000', '₹25,000 – ₹45,000', '₹45,000+'].map((v) => <button className={form.budget === v ? 'active-choice' : ''} onClick={() => update('budget', v)} key={v}>{v}</button>)}
          </div>
          <label className="label">Travel style</label>
          <div className="choice-row">
            {[['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['packed', 'See more']].map(([v, label]) => <button className={form.style === v ? 'active-choice' : ''} onClick={() => update('style', v)} key={v}>{label}</button>)}
          </div>
          <button className="btn btn-primary full large" onClick={generate} disabled={loading || !form.destination}>
            {loading ? <><span className="spinner" /> AI is planning your trip…</> : <><Sparkles size={19} /> Generate complete itinerary</>}
          </button>
          {error && <p className="api-error">{error}</p>}
          <p className="helper">
            {config.services?.ai ? 'OpenAI is configured on the server.' : 'Add OPENAI_API_KEY to .env to switch the planner from demo fallback to live AI.'}
          </p>
        </div>

        <div className="planner-output">
          {!result ? <PlannerPlaceholder config={config} /> : <TripResult result={result} form={form} config={config} showToast={showToast} />}
        </div>
      </section>
    </main>
  );
}

function ServiceChip({ active, label }) {
  return <span className={`service-chip ${active ? 'live' : ''}`}><i /> {label}: {active ? 'ready' : 'needs key'}</span>;
}

function PlannerPlaceholder({ config }) {
  return <div className="card planner-placeholder">
    <div className="ai-orb"><Sparkles /></div>
    <h2>Your AI itinerary will appear here</h2>
    <p>Generate a route and Explore Hub will combine the AI plan with configured travel and Google services.</p>
    <div className="preview-chips"><span><Plane /> Flights</span><span><Hotel /> Hotels</span><span><Car /> Routes</span><span><Utensils /> Food</span></div>
    {!config.services?.ai && <div className="setup-note"><b>AI setup needed</b><span>Copy <code>.env.example</code> to <code>.env</code> and add your OpenAI API key.</span></div>}
  </div>;
}

function TripResult({ result, form, config, showToast }) {
  const { trip, source, model, inventory } = result;
  const [paying, setPaying] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const addCalendar = async () => {
    if (!config.googleClientId) return showToast('Add GOOGLE_CLIENT_ID to .env first');
    setCalendarLoading(true);
    try {
      await addTripToGoogleCalendar({ clientId: config.googleClientId, trip, startDate: form.startDate });
      showToast('Trip added to Google Calendar');
    } catch (error) {
      showToast(error.message);
    } finally {
      setCalendarLoading(false);
    }
  };

  const checkout = async () => {
    if (!config.services?.payments) return showToast('Add Razorpay test credentials to .env to enable checkout');
    setPaying(true);
    try {
      const { keyId, order } = await createPaymentOrder(trip.estimatedTotal, `${trip.destination} smart trip`);
      await loadRazorpay();
      const checkoutInstance = new window.Razorpay({
        key: keyId,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'Explore Hub',
        description: `${trip.destination} trip bundle`,
        theme: { color: '#f97316' },
        handler: () => showToast('Payment completed. Add server-side payment verification before production use.'),
      });
      checkoutInstance.open();
    } catch (error) {
      showToast(error.message);
    } finally {
      setPaying(false);
    }
  };

  return <div className="trip-result">
    <div className="card result-summary">
      <div>
        <span className={`mini-label ai-source ${source === 'openai' ? 'live-source' : ''}`}>{source === 'openai' ? `LIVE AI · ${model}` : 'DEMO FALLBACK'}</span>
        <h2>{trip.destination} Smart Trip</h2><p>{trip.summary}</p>
      </div>
      <div className="estimate"><span>Estimated trip</span><b>₹{Number(trip.estimatedTotal || 0).toLocaleString('en-IN')}</b></div>
    </div>

    <TripMap config={config} origin={form.from} destination={form.destination} />

    <div className="timeline">
      {trip.plan.map((day) => <div className="timeline-day card" key={day.day}>
        <div className="day-badge">Day {day.day}</div>
        <h3>{day.title}</h3>
        {day.items.map((item, i) => <div className="timeline-item" key={`${day.day}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></div>)}
      </div>)}
    </div>

    <LiveInventory inventory={inventory} />
    <NearbyDiscovery config={config} destination={trip.destination} />

    {trip.notes?.length > 0 && <div className="card trip-notes"><h3>Planner notes</h3>{trip.notes.map((note) => <p key={note}><Check size={15} /> {note}</p>)}</div>}

    <div className="card bundle-bar">
      <div><b>Ready for the next step?</b><span>Use live provider inventory where configured. Final availability and prices must be rechecked before purchase.</span></div>
      <div className="bundle-actions">
        <button className="btn btn-ghost" onClick={addCalendar} disabled={calendarLoading}>{calendarLoading ? 'Adding…' : <><CalendarDays size={17} /> Add to Calendar</>}</button>
        <button className="btn btn-primary" onClick={checkout} disabled={paying}>{paying ? 'Opening…' : <><WalletCards size={17} /> Checkout</>}</button>
      </div>
    </div>
  </div>;
}

function TripMap({ config, origin, destination }) {
  const ref = useRef(null);
  const [status, setStatus] = useState(config.services?.maps ? 'Loading Google route…' : 'Google Maps needs an API key');

  useEffect(() => {
    if (!config.googleMapsApiKey || !ref.current || !origin || !destination) return;
    let disposed = false;
    let routeHandle;
    setStatus('Loading Google route…');
    drawGoogleRoute({
      apiKey: config.googleMapsApiKey,
      mapId: config.googleMapId,
      element: ref.current,
      origin,
      destination,
    }).then((handle) => {
      routeHandle = handle;
      if (!disposed) setStatus('');
    }).catch((error) => {
      if (!disposed) setStatus(error.message);
    });
    return () => {
      disposed = true;
      routeHandle?.polylines?.forEach((polyline) => polyline.setMap(null));
    };
  }, [config.googleMapsApiKey, config.googleMapId, origin, destination]);

  return <div className="card live-map-card">
    <div className="card-head"><div><span className="mini-label">GOOGLE MAPS ROUTE</span><h2>{origin} → {destination}</h2></div><span className={`connection-badge ${config.services?.maps ? 'connected' : ''}`}>{config.services?.maps ? 'API configured' : 'Setup required'}</span></div>
    <div className="live-map" ref={ref}>{status && <div className="map-status"><Map size={28} /><b>{status}</b><span>Enable Maps JavaScript API, Places API (New), and Routes API.</span></div>}</div>
  </div>;
}

function LiveInventory({ inventory }) {
  if (!inventory) return null;
  const flights = inventory.flights || [];
  const hotels = inventory.hotels || [];
  return <div className="card live-inventory">
    <div className="card-head"><div><span className="mini-label">TRAVEL INVENTORY</span><h2>Flights & stays</h2></div><span className={`connection-badge ${inventory.configured ? 'connected' : ''}`}>{inventory.source || 'Demo'}</span></div>
    <div className="inventory-grid">
      <div><h3><Plane size={18} /> Flights</h3>{flights.length ? flights.map((f, i) => <div className="inventory-row" key={f.id || i}><div><b>{f.carrier}</b><small>{f.route} · {formatTravelTime(f.departure)} → {formatTravelTime(f.arrival)}</small></div><span>₹{Number(f.price || 0).toLocaleString('en-IN')}</span></div>) : <p className="muted-copy">No flight offers returned.</p>}</div>
      <div><h3><Hotel size={18} /> Hotels</h3>{hotels.length ? hotels.map((h, i) => <div className="inventory-row" key={h.id || i}><div><b>{h.name}</b><small>{h.available === false ? 'Unavailable' : 'Available offer'} · {h.source || inventory.source}</small></div><span>{h.price ? `₹${Number(h.price).toLocaleString('en-IN')}` : 'Check price'}</span></div>) : <p className="muted-copy">Hotel pricing was not returned.</p>}</div>
    </div>
    {!inventory.configured && <p className="inventory-warning">Demo inventory is shown. Add Amadeus credentials to <code>.env</code> for live flight/hotel API calls.</p>}
  </div>;
}

function formatTravelTime(value) {
  if (!value) return 'time n/a';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function NearbyDiscovery({ config, destination }) {
  const [places, setPlaces] = useState({ hotels: [], restaurants: [] });
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!config.googleMapsApiKey || !destination) return;
    let cancelled = false;
    setStatus('Finding nearby places with Google Places…');
    Promise.all([
      searchGooglePlaces(config.googleMapsApiKey, `hotels in ${destination}, India`, 4),
      searchGooglePlaces(config.googleMapsApiKey, `restaurants in ${destination}, India`, 4),
    ]).then(([hotels, restaurants]) => {
      if (!cancelled) { setPlaces({ hotels, restaurants }); setStatus(''); }
    }).catch((error) => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, [config.googleMapsApiKey, destination]);

  return <div className="card nearby-live-card">
    <div className="card-head"><div><span className="mini-label">GOOGLE PLACES</span><h2>Nearby discovery</h2></div><span className={`connection-badge ${config.services?.maps ? 'connected' : ''}`}>{config.services?.maps ? 'Live Places' : 'Needs Maps key'}</span></div>
    {status && <p className="muted-copy">{status}</p>}
    {!config.googleMapsApiKey ? <p className="muted-copy">Configure Google Maps to load real hotels and restaurants around the destination.</p> : <div className="inventory-grid">
      <PlacesColumn icon={<Hotel size={18} />} title="Hotels on Google" items={places.hotels} />
      <PlacesColumn icon={<Utensils size={18} />} title="Restaurants on Google" items={places.restaurants} />
    </div>}
  </div>;
}

function PlacesColumn({ icon, title, items }) {
  return <div><h3>{icon} {title}</h3>{items.map((place) => <div className="inventory-row" key={`${place.name}-${place.address}`}><div><b>{place.name}</b><small>{place.rating ? `${place.rating} ★ · ` : ''}{place.address}</small></div>{place.url ? <a href={place.url} target="_blank" rel="noreferrer">Maps</a> : null}</div>)}</div>;
}

function CrowdInsights() {
  return <main className="page-main">
    <section className="page-hero compact"><div className="container"><div className="eyebrow dark"><BarChart3 size={16} /> Crowd Intelligence</div><h1>Choose the right place at the right time.</h1><p>Compare crowd intensity and discover calmer alternatives before adding a stop to your trip.</p></div></section>
    <section className="section container crowd-grid">
      <div className="card crowd-map">
        <div className="card-head"><div><span className="mini-label">DEMO HEATMAP</span><h2>Tourism activity overview</h2></div><select><option>Today</option><option>This weekend</option><option>Next week</option></select></div>
        <div className="map-visual">
          <div className="map-lines" />
          <div className="bubble b1">84<span>Jaipur</span></div><div className="bubble b2">72<span>Ahmedabad</span></div><div className="bubble b3 low">34<span>Kutch</span></div><div className="bubble b4">63<span>Udaipur</span></div>
        </div>
        <div className="legend"><span><i className="low-dot" /> Calm</span><span><i className="mid-dot" /> Moderate</span><span><i className="high-dot" /> Busy</span></div>
      </div>
      <div className="crowd-list">
        {DESTINATIONS.map((d) => <div className="card crowd-row" key={d.name}>
          <div><h3>{d.name}</h3><p>{d.tag}</p></div>
          <div className="crowd-score"><b>{d.score}%</b><span className={`status ${d.score > 75 ? 'busy' : d.score < 45 ? 'calm' : 'moderate'}`}>{d.crowd}</span></div>
          <div className="crowd-meter"><i style={{ width: `${d.score}%` }} /></div>
          <small>Suggested: {d.score > 75 ? 'Visit early morning or choose nearby alternatives.' : d.score < 45 ? 'Good time for a quieter visit.' : 'Normal visitor activity expected.'}</small>
        </div>)}
      </div>
    </section>
  </main>;
}

function HostEvent({ showToast, navigate }) {
  const [step, setStep] = useState(1);
  const [verifying, setVerifying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [host, setHost] = useState({ legalName: '', gstin: '', identityRef: '', consent: false });
  const [event, setEvent] = useState({ title: '', city: '', category: 'Culture', date: '', price: '', capacity: '', description: '', address: '', rules: '' });

  const doVerify = async () => {
    if (!host.legalName || !host.gstin || !host.consent) return showToast('Complete the verification fields first');
    setVerifying(true);
    const result = await verifyHost(host);
    setVerifying(false);
    if (result.ok) { showToast(result.message || 'Verification request accepted'); setStep(2); }
  };
  const publish = async () => {
    if (!event.title || !event.city || !event.date || !event.price) return showToast('Add the required event details');
    setPublishing(true);
    await createHostedEvent(event);
    setPublishing(false);
    showToast('Event submitted for review');
    setTimeout(() => navigate('explore'), 700);
  };

  return <main className="page-main">
    <section className="page-hero compact"><div className="container"><div className="eyebrow dark"><PlusCircle size={16} /> Host on Explore Hub</div><h1>Share an experience. Grow local tourism.</h1><p>Create a detailed listing for cultural events, road trips, workshops, private-land experiences and more.</p></div></section>
    <section className="section container host-layout">
      <div className="steps card">
        {[['1', 'Verify host', 'Identity & business'], ['2', 'Event details', 'What travelers get'], ['3', 'Media & review', 'Photos and publishing']].map(([n, t, s], i) => <div className={`step-item ${step >= i + 1 ? 'done' : ''}`} key={n}><span>{step > i + 1 ? <Check size={17} /> : n}</span><div><b>{t}</b><small>{s}</small></div></div>)}
        <div className="kyc-note"><ShieldCheck /><div><b>Privacy-first verification</b><p>In production, use a compliant identity-verification provider and store only verification status/reference data—not raw Aadhaar credentials.</p></div></div>
      </div>

      <div className="card host-form-card">
        {step === 1 && <>
          <div className="form-title"><span className="mini-label">STEP 1 OF 3</span><h2>Host verification</h2><p>Build trust before publishing an event.</p></div>
          <div className="form-grid two">
            <Field label="Legal / business name"><input value={host.legalName} onChange={(e) => setHost({ ...host, legalName: e.target.value })} placeholder="Organizer name" /></Field>
            <Field label="GSTIN"><input value={host.gstin} onChange={(e) => setHost({ ...host, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength="15" /></Field>
          </div>
          <Field label="Identity verification reference"><input value={host.identityRef} onChange={(e) => setHost({ ...host, identityRef: e.target.value })} placeholder="Demo reference / provider token (do not enter real Aadhaar here)" /></Field>
          <label className="consent"><input type="checkbox" checked={host.consent} onChange={(e) => setHost({ ...host, consent: e.target.checked })} /><span>I consent to identity and business verification for host onboarding.</span></label>
          <button className="btn btn-primary full large" onClick={doVerify} disabled={verifying}>{verifying ? 'Verifying…' : <><ShieldCheck size={18} /> Verify & continue</>}</button>
        </>}
        {step === 2 && <>
          <div className="form-title"><span className="mini-label">STEP 2 OF 3</span><h2>Create your experience</h2><p>Give travelers enough detail to understand exactly what they’re booking.</p></div>
          <Field label="Event / experience title"><input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} placeholder="Example: Traditional Garba Night" /></Field>
          <div className="form-grid two">
            <Field label="City"><input value={event.city} onChange={(e) => setEvent({ ...event, city: e.target.value })} placeholder="Ahmedabad" /></Field>
            <Field label="Category"><select value={event.category} onChange={(e) => setEvent({ ...event, category: e.target.value })}>{categories.slice(1).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Date"><input type="date" value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} /></Field>
            <Field label="Price per person (₹)"><input type="number" value={event.price} onChange={(e) => setEvent({ ...event, price: e.target.value })} /></Field>
            <Field label="Capacity"><input type="number" value={event.capacity} onChange={(e) => setEvent({ ...event, capacity: e.target.value })} /></Field>
            <Field label="Meeting / event location"><input value={event.address} onChange={(e) => setEvent({ ...event, address: e.target.value })} placeholder="Area or venue" /></Field>
          </div>
          <Field label="Description"><textarea rows="5" value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} placeholder="Describe the experience, schedule, inclusions and what makes it special." /></Field>
          <Field label="Rules / traveler requirements"><textarea rows="3" value={event.rules} onChange={(e) => setEvent({ ...event, rules: e.target.value })} placeholder="Age guidance, dress code, accessibility, cancellation rules, safety information, etc." /></Field>
          <div className="form-actions"><button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><button className="btn btn-primary" onClick={() => setStep(3)}>Continue <ArrowRight size={17} /></button></div>
        </>}
        {step === 3 && <>
          <div className="form-title"><span className="mini-label">STEP 3 OF 3</span><h2>Add photos & review</h2><p>High-quality real photos help travelers understand the location and event.</p></div>
          <div className="upload-zone"><Upload size={29} /><b>Upload event and location photos</b><span>JPG, PNG · Demo UI</span><button className="btn btn-ghost"><Camera size={17} /> Choose photos</button></div>
          <div className="review-box"><h3>Listing preview</h3><p><b>{event.title || 'Your experience title'}</b></p><span>{event.city || 'City'} · {event.category} · ₹{event.price || '0'} per person</span><p>{event.description || 'Your event description will appear here.'}</p></div>
          <div className="form-actions"><button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button><button className="btn btn-primary" onClick={publish} disabled={publishing}>{publishing ? 'Submitting…' : <><BadgeCheck size={17} /> Submit for review</>}</button></div>
        </>}
      </div>
    </section>
  </main>;
}

function EventCard({ event, onOpen }) {
  return <article className="event-card" onClick={onOpen}>
    <div className="event-image" style={{ backgroundImage: `url(${event.image})` }}>
      <span className="category-badge">{event.category}</span>
      <span className={`crowd-badge ${event.crowd < 40 ? 'calm' : event.crowd > 75 ? 'busy' : ''}`}><Users size={14} /> {event.crowd < 40 ? 'Low crowd' : event.crowd > 75 ? 'Popular now' : 'Moderate crowd'}</span>
    </div>
    <div className="event-body">
      <div className="event-location"><MapPin size={15} /> {event.city}, {event.state}</div>
      <h3>{event.title}</h3>
      <div className="host-line"><ShieldCheck size={15} /> {event.host}</div>
      <div className="event-meta"><span><Star size={15} fill="currentColor" /> {event.rating} <small>({event.bookings.toLocaleString('en-IN')})</small></span><span><Clock3 size={15} /> {event.duration}</span></div>
      <div className="event-foot"><span>from <b>₹{event.price.toLocaleString('en-IN')}</b> / person</span><button aria-label="Open event"><ArrowRight size={18} /></button></div>
    </div>
  </article>;
}

function EventModal({ event, onClose, showToast, navigate, config }) {
  const [tab, setTab] = useState('overview');
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal event-modal" onMouseDown={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={onClose}><X /></button>
      <div className="modal-hero" style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(5,20,20,.72)),url(${event.image})` }}>
        <div><span className="category-badge">{event.category}</span><h2>{event.title}</h2><p><MapPin size={16} /> {event.city}, {event.state}</p></div>
      </div>
      <div className="modal-tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'nearby' ? 'active' : ''} onClick={() => setTab('nearby')}>Nearby services</button></div>
      <div className="modal-content">
        {tab === 'overview' ? <>
          <div className="quick-facts"><div><CalendarDays /><span><b>{event.date}</b><small>Date</small></span></div><div><Clock3 /><span><b>{event.duration}</b><small>Duration</small></span></div><div><Users /><span><b>{event.capacity}</b><small>Capacity</small></span></div><div><Star /><span><b>{event.rating}/5</b><small>Rating</small></span></div></div>
          <div className="modal-copy"><h3>About this experience</h3><p>{event.description}</p><h3>Highlights</h3><div className="highlight-list">{event.highlights.map((h) => <span key={h}><Check /> {h}</span>)}</div><div className="verified-host"><ShieldCheck /><div><b>Verified host</b><p>{event.host} · identity/business verification completed</p></div></div></div>
        </> : <NearbyServices config={config} city={event.city} />}
      </div>
      <div className="booking-bar"><div><span>From</span><b>₹{event.price.toLocaleString('en-IN')} <small>/ person</small></b></div><div className="booking-actions"><button className="btn btn-ghost" onClick={() => { onClose(); navigate('planner'); }}>Plan full trip</button><button className="btn btn-primary" onClick={() => showToast('Experience added to demo booking')}>Book experience <ArrowRight size={17} /></button></div></div>
    </div>
  </div>;
}

function NearbyServices({ config, city }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config?.googleMapsApiKey || !city) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      searchGooglePlaces(config.googleMapsApiKey, `hotels in ${city}, India`, 3),
      searchGooglePlaces(config.googleMapsApiKey, `restaurants in ${city}, India`, 3),
    ]).then(([hotels, food]) => {
      if (!cancelled) setLive({ hotels, food });
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [config?.googleMapsApiKey, city]);

  if (loading) return <div className="nearby-loading">Loading nearby services from Google Places…</div>;
  if (live) {
    const sections = [[Hotel, 'Hotels', live.hotels], [Utensils, 'Restaurants', live.food]];
    return <div className="nearby-sections live-nearby">{sections.map(([Icon, title, items]) => <div className="nearby-block" key={title}><h3><Icon size={19} /> {title}</h3>{items.map((item) => <div className="nearby-row" key={`${title}-${item.name}`}><div><b>{item.name}</b><small>{item.rating ? `${item.rating} ★ · ` : ''}{item.address}</small></div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Maps</a> : null}</div>)}</div>)}</div>;
  }

  const sections = [[Hotel, 'Hotels', NEARBY.hotels], [Utensils, 'Restaurants', NEARBY.food], [Car, 'Transport', NEARBY.transport]];
  return <><div className="nearby-fallback-note">{config?.services?.maps ? 'Live Places did not return results; showing demo nearby data.' : 'Add GOOGLE_MAPS_API_KEY to .env for live nearby places.'}</div><div className="nearby-sections">{sections.map(([Icon, title, items]) => <div className="nearby-block" key={title}><h3><Icon size={19} /> {title}</h3>{items.map((item) => <div className="nearby-row" key={item.name}><div><b>{item.name}</b><small>{item.meta}</small></div><span>{item.price}</span></div>)}</div>)}</div></>;
}

function SectionHead({ kicker, title, subtitle, action, onAction }) {
  return <div className="section-head"><div><span className="mini-label">{kicker}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button onClick={onAction}>{action} <ArrowRight size={17} /></button>}</div>;
}

function Feature({ icon, title, text }) { return <div className="feature-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p><a>Learn more <ChevronRight size={15} /></a></div>; }

function Field({ label, icon, children }) { return <label className="field"><span className="field-label">{icon}{label}</span>{children}</label>; }

function Footer({ navigate }) {
  return <footer><div className="container footer-grid"><div><div className="brand footer-brand"><span className="brand-mark"><Navigation size={21} /></span><span>Explore <span>Hub</span></span></div><p>AI-powered travel that connects people with verified local experiences and complete trip planning.</p></div><div><b>Explore</b><button onClick={() => navigate('explore')}>Experiences</button><button onClick={() => navigate('planner')}>AI Planner</button><button onClick={() => navigate('crowd')}>Crowd insights</button></div><div><b>Host</b><button onClick={() => navigate('host')}>List an event</button><button>Host standards</button><button>Safety & trust</button></div><div><b>Project</b><button>About</button><button>How it works</button><button>Contact</button></div></div><div className="container footer-bottom"><span>© 2026 Explore Hub · SIH tourism prototype</span><span>Privacy · Terms · Trust & Safety</span></div></footer>;
}
