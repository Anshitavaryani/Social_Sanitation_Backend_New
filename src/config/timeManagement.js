/** @format */

function convertToEST(gmtDateTimeStr) {
	if (!gmtDateTimeStr) return null;

	const utcDate = new Date(gmtDateTimeStr);
	if (isNaN(utcDate.getTime())) return null;

	// Convert to EST
	const estFormatter = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	const parts = estFormatter.formatToParts(utcDate).reduce((acc, part) => {
		if (part.type !== "literal") {
			acc[part.type] = part.value;
		}
		return acc;
	}, {});

	let hour = parseInt(parts.hour, 10);
	let date = `${parts.year}-${parts.month}-${parts.day}`;

	if (hour === 24) {
		// Adjust to next day with hour 00
		const adjustedDate = new Date(`${date}T00:00:00`);
		adjustedDate.setDate(adjustedDate.getDate() + 1);

		const adjY = adjustedDate.getFullYear();
		const adjM = String(adjustedDate.getMonth() + 1).padStart(2, "0");
		const adjD = String(adjustedDate.getDate()).padStart(2, "0");

		date = `${adjY}-${adjM}-${adjD}`;
		hour = "00";
	} else {
		hour = String(hour).padStart(2, "0");
	}

	return `${date} ${hour}:${parts.minute}:${parts.second}`;
}

module.exports = convertToEST;
