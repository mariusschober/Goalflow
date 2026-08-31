
// A lightweight implementation of sunrise/sunset calculation
// Adapted for minimal dependency usage.

// Radians conversion
const rad = (deg: number) => deg * (Math.PI / 180);
const deg = (rad: number) => rad * (180 / Math.PI);

// Julian date
const getJulianDate = (date: Date) => {
    return (date.getTime() / 86400000) - (date.getTimezoneOffset() / 1440) + 2440587.5;
};

// Solar Mean Anomaly
const getSolarMeanAnomaly = (d: number) => {
    return rad((357.5291 + 0.98560028 * d) % 360);
};

// Equation of Center
const getEquationOfCenter = (M: number) => {
    return rad(1.9148 * Math.sin(M) + 0.0200 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
};

// Ecliptic Longitude
const getEclipticLongitude = (M: number, C: number) => {
    const P = rad(102.9372); // Perihelion of the Earth
    return M + C + P + Math.PI;
};

// Sun Declination
const getSunDeclination = (L: number) => {
    const e = rad(23.4397); // Obliquity of the Ecliptic
    return Math.asin(Math.sin(L) * Math.sin(e));
};

// Hour Angle
const getHourAngle = (lat: number, decl: number) => {
    const latRad = rad(lat);
    // Sun's zenith for sunrise/sunset is officially 90 degrees 50 minutes (90.8333)
    const zenith = rad(90.8333);
    const cosH = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
    
    if (cosH > 1) return null; // Sun never rises
    if (cosH < -1) return null; // Sun never sets
    
    return Math.acos(cosH);
};

export const getSunTimes = (date: Date, lat: number, lng: number) => {
    // 1. Calculate Julian Date
    // Number of days since Jan 1st, 2000 12:00
    const J2000 = 2451545;
    const jd = getJulianDate(date);
    const n = Math.ceil(jd - J2000 - 0.0009) + 0.0008; // Julian cycle

    // 2. Mean Solar Noon
    const Jstar = n - lng / 360;
    
    // 3. Solar Mean Anomaly
    const M = getSolarMeanAnomaly(n);
    
    // 4. Equation of the Center
    const C = getEquationOfCenter(M);
    
    // 5. Ecliptic Longitude
    const L = getEclipticLongitude(M, C);
    
    // 6. Solar Transit (Noon)
    const Jtransit = 2451545 + Jstar + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    
    // 7. Declination of Sun
    const delta = getSunDeclination(L);
    
    // 8. Hour Angle
    const H = getHourAngle(lat, delta);
    
    // Solar Noon (Julian to JS Date)
    const dateNoon = new Date((Jtransit - 2440587.5) * 86400000);

    if (H === null) return { sunrise: null, sunset: null, solarNoon: formatTime(dateNoon) }; // Polar day/night
    
    // 9. Calculate Sunrise/Sunset (Julian)
    // Jrise = Jtransit - H / (2*PI)
    // Jset = Jtransit + H / (2*PI)
    const Jrise = Jtransit - H / (2 * Math.PI);
    const Jset = Jtransit + H / (2 * Math.PI);
    
    // Convert Julian to JS Date
    const dateRise = new Date((Jrise - 2440587.5) * 86400000);
    const dateSet = new Date((Jset - 2440587.5) * 86400000);
    
    return {
        sunrise: formatTime(dateRise),
        sunset: formatTime(dateSet),
        solarNoon: formatTime(dateNoon),
        dateRise,
        dateSet,
        dateNoon
    };
};

const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Calculate Day Length (Photoperiod) in hours
export const getPhotoperiod = (sunriseDate: Date, sunsetDate: Date) => {
    return (sunsetDate.getTime() - sunriseDate.getTime()) / (1000 * 60 * 60);
};

// Calculate seasonal sleep recommendation
export const getSeasonalSleepRecommendation = (photoperiod: number) => {
    if (photoperiod < 10) return { duration: 8.5, reason: "Winter: Extended biological night" };
    if (photoperiod < 14) return { duration: 8.0, reason: "Transitional: Standard" };
    return { duration: 7.5, reason: "Summer: Compressed biological night" };
};
