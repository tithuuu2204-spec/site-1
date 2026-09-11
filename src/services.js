const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export async function getPublicConfig() {
  return api('/config');
}

export async function getCurrentUser() {
  try {
    const data = await api('/auth/me');
    return data.user || null;
  } catch {
    return null;
  }
}

export async function signInWithGoogle(credential) {
  return api('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export async function signOut() {
  return api('/auth/logout', { method: 'POST', body: '{}' });
}

export async function verifyHost(payload) {
  return api('/host/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createHostedEvent(payload) {
  return api('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function buildAITrip(input) {
  const data = await api('/ai/trip', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function searchTravelInventory(input) {
  return api('/travel/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createPaymentOrder(amount, description = 'Explore Hub trip') {
  return api('/payments/order', {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
}
