let googleMapsPromise;
let googleIdentityPromise;
let razorpayPromise;

function loadScript(src, id) {
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function loadGoogleIdentity() {
  if (!googleIdentityPromise) {
    googleIdentityPromise = loadScript('https://accounts.google.com/gsi/client', 'google-identity-services');
  }
  return googleIdentityPromise;
}

export function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.reject(new Error('Google Maps API key is not configured.'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    googleMapsPromise = loadScript(src, 'google-maps-platform').then(() => window.google.maps);
  }
  return googleMapsPromise;
}

export async function searchGooglePlaces(apiKey, textQuery, maxResultCount = 5) {
  await loadGoogleMaps(apiKey);
  const { Place } = await window.google.maps.importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery,
    fields: ['displayName', 'formattedAddress', 'rating', 'userRatingCount', 'googleMapsURI', 'location'],
    maxResultCount,
    region: 'IN',
  });
  return (places || []).map((place) => ({
    name: place.displayName || 'Place',
    address: place.formattedAddress || '',
    rating: place.rating || null,
    ratingCount: place.userRatingCount || null,
    url: place.googleMapsURI || '',
    location: place.location ? { lat: place.location.lat(), lng: place.location.lng() } : null,
  }));
}

export async function drawGoogleRoute({ apiKey, mapId = 'DEMO_MAP_ID', element, origin, destination }) {
  await loadGoogleMaps(apiKey);
  const [{ Map }, { Route }, { LatLngBounds }] = await Promise.all([
    window.google.maps.importLibrary('maps'),
    window.google.maps.importLibrary('routes'),
    window.google.maps.importLibrary('core'),
  ]);

  const map = new Map(element, {
    zoom: 6,
    center: { lat: 23.0225, lng: 72.5714 },
    mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  const { routes } = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    fields: ['path'],
  });

  if (!routes?.length) throw new Error('No driving route was found for this trip.');
  const polylines = routes[0].createPolylines();
  polylines.forEach((polyline) => polyline.setMap(map));
  const bounds = new LatLngBounds();
  routes[0].path.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds);
  return { map, route: routes[0], polylines };
}

export async function addTripToGoogleCalendar({ clientId, trip, startDate }) {
  if (!clientId) throw new Error('Google Client ID is not configured.');
  await loadGoogleIdentity();
  const token = await new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (response) => {
        if (response.error) reject(new Error(response.error_description || response.error));
        else resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error?.message || 'Google authorization failed.')),
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  const firstDate = new Date(`${startDate}T09:00:00`);
  for (const day of trip.plan) {
    const start = new Date(firstDate);
    start.setDate(firstDate.getDate() + Number(day.day || 1) - 1);
    const end = new Date(start);
    end.setHours(18, 0, 0, 0);
    const event = {
      summary: `Explore Hub · Day ${day.day}: ${day.title}`,
      description: day.items.join('\n• '),
      location: trip.destination,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error?.message || 'Could not add the trip to Google Calendar.');
    }
  }
  return true;
}

export function loadRazorpay() {
  if (!razorpayPromise) {
    razorpayPromise = loadScript('https://checkout.razorpay.com/v1/checkout.js', 'razorpay-checkout');
  }
  return razorpayPromise;
}
