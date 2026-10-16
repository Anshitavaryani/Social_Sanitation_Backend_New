// Great-circle (haversine) distance between two points given in degrees.
const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversine = (lat1, lon1, lat2, lon2, radius) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
};

const distanceInKm = (lat1, lon1, lat2, lon2) => haversine(lat1, lon1, lat2, lon2, EARTH_RADIUS_KM);

// Rounded to 2 decimals, as shown in the closest-employee lists
const distanceInMiles = (lat1, lon1, lat2, lon2) => Number(haversine(lat1, lon1, lat2, lon2, EARTH_RADIUS_MILES).toFixed(2));

module.exports = { distanceInKm, distanceInMiles };
