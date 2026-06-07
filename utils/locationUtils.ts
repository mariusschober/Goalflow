export interface LocationCoords {
  latitude: number;
  longitude: number;
  source: 'gps' | 'ip' | 'cache' | 'default' | 'timezone';
  cityName?: string;
  countryName?: string;
}

const DEFAULT_COORDS: LocationCoords = {
  latitude: 52.5200, // Berlin (default fallback)
  longitude: 13.4050,
  source: 'default',
  cityName: 'Berlin',
  countryName: 'Germany'
};

// Map popular timezones to logical coordinates to get a highly accurate fallback
const TIMEZONE_LOCATION_MAP: Record<string, { lat: number, lng: number, city: string, country: string }> = {
  'Europe/Berlin': { lat: 52.5200, lng: 13.4050, city: 'Berlin', country: 'Germany' },
  'Europe/Paris': { lat: 48.8566, lng: 2.3522, city: 'Paris', country: 'France' },
  'Europe/London': { lat: 51.5074, lng: -0.1278, city: 'London', country: 'United Kingdom' },
  'Europe/Rome': { lat: 41.9028, lng: 12.4964, city: 'Rome', country: 'Italy' },
  'Europe/Madrid': { lat: 40.4168, lng: -3.7038, city: 'Madrid', country: 'Spain' },
  'Europe/Vienna': { lat: 48.2082, lng: 16.3738, city: 'Vienna', country: 'Austria' },
  'Europe/Zurich': { lat: 47.3769, lng: 8.5417, city: 'Zurich', country: 'Switzerland' },
  'Europe/Amsterdam': { lat: 52.3676, lng: 4.9041, city: 'Amsterdam', country: 'Netherlands' },
  'Europe/Stockholm': { lat: 59.3293, lng: 18.0686, city: 'Stockholm', country: 'Sweden' },
  'Europe/Oslo': { lat: 59.9139, lng: 10.7522, city: 'Oslo', country: 'Norway' },
  'America/New_York': { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'United States' },
  'America/Chicago': { lat: 41.8781, lng: -87.6298, city: 'Chicago', country: 'United States' },
  'America/Denver': { lat: 39.7392, lng: -104.9903, city: 'Denver', country: 'United States' },
  'America/Los_Angeles': { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', country: 'United States' },
  'America/Toronto': { lat: 43.6532, lng: -79.3832, city: 'Toronto', country: 'Canada' },
  'America/Vancouver': { lat: 49.2827, lng: -123.1207, city: 'Vancouver', country: 'Canada' },
  'America/Mexico_City': { lat: 19.4326, lng: -99.1332, city: 'Mexico City', country: 'Mexico' },
  'America/Sao_Paulo': { lat: -23.5505, lng: -46.6333, city: 'Sao Paulo', country: 'Brazil' },
  'America/Argentina/Buenos_Aires': { lat: -34.6037, lng: -58.3816, city: 'Buenos Aires', country: 'Argentina' },
  'Asia/Tokyo': { lat: 35.6762, lng: 139.6503, city: 'Tokyo', country: 'Japan' },
  'Asia/Seoul': { lat: 37.5665, lng: 126.9780, city: 'Seoul', country: 'South Korea' },
  'Asia/Shanghai': { lat: 31.2304, lng: 121.4737, city: 'Shanghai', country: 'China' },
  'Asia/Hong_Kong': { lat: 22.3193, lng: 114.1694, city: 'Hong Kong', country: 'Hong Kong' },
  'Asia/Singapore': { lat: 1.3521, lng: 103.8198, city: 'Singapore', country: 'Singapore' },
  'Asia/Kolkata': { lat: 22.5726, lng: 88.3639, city: 'Kolkata', country: 'India' },
  'Asia/Dubai': { lat: 25.2048, lng: 55.2708, city: 'Dubai', country: 'United Arab Emirates' },
  'Australia/Sydney': { lat: -33.8688, lng: 151.2093, city: 'Sydney', country: 'Australia' },
  'Australia/Melbourne': { lat: -37.8136, lng: 144.9631, city: 'Melbourne', country: 'Australia' },
  'Pacific/Auckland': { lat: -36.8485, lng: 174.7633, city: 'Auckland', country: 'New Zealand' },
  'Africa/Johannesburg': { lat: -26.2041, lng: 28.0473, city: 'Johannesburg', country: 'South Africa' },
  'Africa/Cairo': { lat: 30.0444, lng: 31.2357, city: 'Cairo', country: 'Egypt' }
};

export const getCachedLocation = (): LocationCoords | null => {
  try {
    const cached = localStorage.getItem('goalflow_cached_location');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to read cached location from localStorage', e);
  }
  return null;
};

export const cacheLocation = (coords: LocationCoords) => {
  try {
    localStorage.setItem('goalflow_cached_location', JSON.stringify(coords));
  } catch (e) {
    console.warn('Failed to save cached location to localStorage', e);
  }
};

/**
 * Gets coordinates based on user timezone as a low-overhead, fast, no-network fallback.
 */
export const getTimezoneApproximation = (): LocationCoords => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_LOCATION_MAP[tz]) {
      const mapped = TIMEZONE_LOCATION_MAP[tz];
      return {
        latitude: mapped.lat,
        longitude: mapped.lng,
        source: 'timezone',
        cityName: mapped.city,
        countryName: mapped.country
      };
    }
  } catch (e) {
    console.warn('Failed to resolve timezone approximation', e);
  }
  return DEFAULT_COORDS;
};

/**
 * Attempts IP Geolocation fallback via public free APIs.
 */
export const getIpLocation = async (): Promise<LocationCoords> => {
  // We try freeipapi.com first as it's modern, supports CORS, has HTTPS, and is free of keys
  try {
    const response = await fetch('https://freeipapi.com/api/json', { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'ip',
          cityName: data.cityName || undefined,
          countryName: data.countryName || undefined
        };
      }
    }
  } catch (e) {
    console.warn('IP location fetch (freeipapi) failed or timed out:', e);
  }

  // Double fallback: ipapi.co
  try {
    const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'ip',
          cityName: data.city || undefined,
          countryName: data.country_name || undefined
        };
      }
    }
  } catch (e) {
    console.warn('IP location fetch (ipapi.co) failed or timed out:', e);
  }

  throw new Error('All IP geolocation endpoints failed');
};

/**
 * Consolidated location trigger:
 * 1. Tries HTML5 Geolocation with a strict 4-second timeout to avoid UI freeze/indefinite pending state.
 * 2. If blocked or timed out, falls back to IP-based search.
 * 3. If IP fails, falls back to the user's last cached location.
 * 4. Failing that, approximates location using timezone maps.
 * 5. Returns absolute static default coordinates if everything has failed.
 */
export const resolveUserLocation = async (timeoutMs: number = 4000): Promise<LocationCoords> => {
  return new Promise<LocationCoords>((resolve) => {
    let resolved = false;

    const handleSuccess = (position: GeolocationPosition) => {
      if (resolved) return;
      resolved = true;
      const coords: LocationCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'gps'
      };
      cacheLocation(coords);
      resolve(coords);
    };

    const handleFailure = async () => {
      if (resolved) return;
      resolved = true;
      
      // Try IP based lookup
      try {
        const ipCoords = await getIpLocation();
        cacheLocation(ipCoords);
        resolve(ipCoords);
        return;
      } catch (err) {
        console.warn('IP lookup also failed. Trying cache or timezone approximation.', err);
      }

      // Try reading local cached position
      const cached = getCachedLocation();
      if (cached) {
        resolve({ ...cached, source: 'cache' });
        return;
      }

      // Try timezone based location approximation list
      const tzCoords = getTimezoneApproximation();
      resolve(tzCoords);
    };

    if ('geolocation' in navigator) {
      // Set an explicit safety timer for browser prompts that might never respond
      const safetyPromise = setTimeout(() => {
        if (!resolved) {
          console.warn('HTML5 Geolocation timed out. Triggering fallback chain.');
          handleFailure();
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(safetyPromise);
          handleSuccess(pos);
        },
        () => {
          clearTimeout(safetyPromise);
          handleFailure();
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 } // cached for 5 mins
      );
    } else {
      handleFailure();
    }
  });
};
