const axios = require("axios");

const getCoordinatesFromGoogleMapLink = async (google_map_link, googleApiKey) => {
	try {
		// Step 1: If it's a shortened maps.app.goo.gl URL, expand it
		if (google_map_link.includes("maps.app.goo.gl")) {
			const expanded = await unshortenGoogleMapsLink(google_map_link);
			if (!expanded) throw new Error("Could not expand shortened URL");
			google_map_link = expanded;
		}

		const parsedUrl = new URL(google_map_link);
		const address = parsedUrl.searchParams.get("query");

		// Step 2: Use query param (if available)
		if (address) {
			const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
				address
			)}&key=${googleApiKey}`;

			const response = await axios.get(apiUrl);
			if (
				response.data.status === "OK" &&
				response.data.results.length > 0
			) {
				const location = response.data.results[0].geometry.location;
				return {
					latitude: location.lat,
					longitude: location.lng,
				};
			}
			throw new Error("Geocoding failed for query address");
		}

		// Step 3: Try to extract lat/lng from path (/@39.60,-75.71,...)
		const pathParts = parsedUrl.pathname.split('/');
		const atSegment = pathParts.find((part) => part.startsWith('@'));
		if (atSegment) {
			const [latStr, lngStr] = atSegment.slice(1).split(',');
			const lat = parseFloat(latStr);
			const lng = parseFloat(lngStr);

			if (!isNaN(lat) && !isNaN(lng)) {
				return {
					latitude: lat,
					longitude: lng,
				};
			}
		}

		throw new Error("No coordinates found in URL");
	} catch (err) {
		console.error("Error fetching coordinates:", err.message);
		return null;
	}
};


const unshortenGoogleMapsLink = async (shortUrl) => {
	try {
		const response = await axios.get(shortUrl, {
			maxRedirects: 0, // Don't follow redirects automatically
			validateStatus: (status) => status >= 300 && status < 400, // Only handle redirects
		});
		const fullUrl = response.headers.location;
		if (!fullUrl) throw new Error("Redirect location not found");
		return fullUrl;
	} catch (err) {
		console.error("Failed to expand shortened Google Maps link:", err.message);
		return null;
	}
};



module.exports = getCoordinatesFromGoogleMapLink;
