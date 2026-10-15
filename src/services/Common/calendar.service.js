/** @format */

const { google } = require("googleapis");
const { AdminOAuth, UserOAuth, User, Admin } = require("../../models");
const calendar = google.calendar("v3");
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const oAuth2Client = new google.auth.OAuth2(
	process.env.CLIENT_ID,
	process.env.CLIENT_SECRET,
	process.env.REDIRECT_URI
);

async function getAuthorizationUrl(userId, roleId) {
	const state = JSON.stringify({ id: userId, role_id: roleId });
	const oAuth2Client = new google.auth.OAuth2(
		process.env.CLIENT_ID,
		process.env.CLIENT_SECRET,
		process.env.REDIRECT_URI
	);

	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES,
		state: state,
	});

	return authUrl;
}

function generateRandomString(length = 40) {
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	const charactersLength = characters.length;

	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}

	return result;
}

async function authorize(id, role_id, code) {
	try {
		const { tokens } = await oAuth2Client.getToken(code);
		let result = false;

		console.log(tokens, "tokens");

		if (
			!tokens ||
			Object.keys(tokens).length === 0 ||
			!tokens["refresh_token"] ||
			tokens["refresh_token"] === ""
		) {
			throw new Error("Failed to Get Access Token !!");
		}

		const refreshToken = tokens.refresh_token;
		let userDoc = {};

		console.log(refreshToken, "refreshToken");

		if (role_id == 6 || role_id == 7) {
			userDoc = await User.findOne({ where: { id: id, role_id: role_id } });
		} else {
			userDoc = await Admin.findOne({ where: { id: id, role_id: role_id } });
		}
		console.log(userDoc, "userDoc");

		if (!userDoc) {
			throw new Error("Invalid User Id");
		}

		let authObj = {
			user_id: userDoc.id,
			role_id: userDoc.role_id,
			refresh_token: refreshToken,
		};

		console.log(authObj, "authObj");

		// Check if the user already has an entry in UserOAuth
		let userOAuthEntry = await UserOAuth.findOne({
			where: { user_id: id, role_id: role_id },
		});

		console.log(userOAuthEntry, "userOAuthEntry");
		let tempToken = generateRandomString();
		if (userOAuthEntry) {
			// Update the existing entry
			userOAuthEntry.refresh_token = refreshToken;
			userOAuthEntry.validate_token = tempToken;
			await userOAuthEntry.save();
			result = tempToken;
		} else {
			let status = await UserOAuth.create(authObj);
			if (!status) {
				result = false;
			}
			status.validate_token = tempToken;
			await status.save();
			result = tempToken;
		}

		console.log(result, "result");

		return result;
	} catch (error) {
		console.log("error in authorization : ", error);
		return false;
	}
}

async function getAdminAuthorizationUrl(adminId) {
	const oAuth2Client = new google.auth.OAuth2(
		process.env.CLIENT_ID,
		process.env.CLIENT_SECRET,
		process.env.REDIRECT_URI
	);

	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES,
		state: adminId,
	});

	return authUrl;
}

async function adminAuthorize(adminId, code) {
	try {
		const { tokens } = await oAuth2Client.getToken(code);

		if (!tokens || !tokens.refresh_token) {
			throw new Error("Failed to Get Access Token !!");
		}

		const refreshToken = tokens.refresh_token;

		let adminDoc = await Admin.findOne({ where: { id: adminId } });
		if (!adminDoc) {
			throw new Error("Invalid Admin Id");
		}

		let authObj = {
			admin_id: adminDoc.id,
			refresh_token: refreshToken,
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET,
		};

		// Check if the admin already has an entry in AdminOAuth
		let adminOAuthEntry = await AdminOAuth.findOne({
			where: { admin_id: adminId },
		});

		if (adminOAuthEntry) {
			// Update the existing entry
			adminOAuthEntry.refresh_token = refreshToken;
			await adminOAuthEntry.save();
		} else {
			// Create a new entry
			await AdminOAuth.create(authObj);
		}

		return "";
	} catch (error) {
		throw new Error(error.message);
	}
}

async function listEvents(body) {
	const { user } = body;
	console.log(body, "body");
	let refrshTokenDoc = await UserOAuth.findOne({
		where: { user_id: user.id, role_id: user.role_id },
	});

	console.log(refrshTokenDoc, "refrshTokenDoc");
	if (!refrshTokenDoc) {
		throw new Error("Failed to fetch refresh token ");
	}

	try {
		let result = getAllEvent(refrshTokenDoc.refresh_token);
		console.log(result, "result");
		return result;
	} catch (err) {
		console.error("Error fetching events:", err.message);
		throw err;
	}
}

async function getAllEvent(refreshToken) {
	let result = [];
	try {
		await oAuth2Client.setCredentials({ refresh_token: refreshToken });
	} catch {
		return "Invalid Google Refresh Token";
	}
	let res = await calendar.events.list({
		auth: oAuth2Client,
		calendarId: "primary",
		timeMin: new Date().toISOString(),
		maxResults: 10,
		singleEvents: true,
		orderBy: "startTime",
	});
	if (!res) {
		return "There was an error contacting the Calendar service";
	}
	const events = res.data.items;
	events.forEach((event) => {
		result.push({ summary: event.summary, id: event.id });
	});
	return result;
}

async function createCalendarEvent(event, refreshTokensArr) {
    let response = {};
    let createdEventIds = []; // To store all created event IDs

    const eventWithoutAttendees = {
        ...event,
        attendees: [], // Ensure attendees are handled separately
    };

    if (refreshTokensArr && Array.isArray(refreshTokensArr)) {
        for (let refreshToken of refreshTokensArr) {
            try {
                // Set the credentials for the OAuth2 client
                await oAuth2Client.setCredentials({ refresh_token: refreshToken });

                // Insert the new event
                const createdEvent = await calendar.events.insert({
                    auth: oAuth2Client,
                    calendarId: "primary",
                    requestBody: eventWithoutAttendees,
                });

                console.log("Calendar Event Created: ", createdEvent.data);

                // Push the created event ID to the array
                createdEventIds.push(createdEvent.data.id);
            } catch (error) {
                console.error("Error While Creating Event In Calendar: ", error);
            }
        }
    }

    // Join the event IDs into a comma-separated string
    const eventIdsString = createdEventIds.join(',');

    // Return the comma-separated event IDs
    return eventIdsString;
}

// async function createCalendarEvent(event, refreshTokensArr) {
// 	let response = {};
// 	let createdEventId = null; // To store the created event ID

// 	const eventWithoutAttendees = {
// 		...event,
// 		attendees: [], // Make sure attendees are handled separately
// 	};

// 	if (refreshTokensArr && Array.isArray(refreshTokensArr)) {
// 		for (let refreshToken of refreshTokensArr) {
// 			try {
// 				// Set the credentials for the OAuth2 client
// 				await oAuth2Client.setCredentials({ refresh_token: refreshToken });

// 				// Insert the new event
// 				const createdEvent = await calendar.events.insert({
// 					auth: oAuth2Client,
// 					calendarId: "primary",
// 					requestBody: eventWithoutAttendees,
// 				});

// 				console.log("Calendar Event Created: ", createdEvent.data);

// 				// Update the event ID (if you need to store or use it later)
// 				createdEventId = createdEvent.data.id;
// 			} catch (error) {
// 				console.error("Error While Creating Event In Calendar: ", error);
// 			}
// 		}
// 	}

// 	// Return the last created event ID
// 	return createdEventId;
// }

// async function createCalendarEvent(event, refreshTokensArr) {
// 	let response = {};
// 	const eventWithoutAttendees = {
// 		...event,
// 		attendees: [],
// 	};

// 	if (refreshTokensArr && Array.isArray(refreshTokensArr)) {
// 		for (let refreshToken of refreshTokensArr) {
// 			try {
// 				await oAuth2Client.setCredentials({ refresh_token: refreshToken });

// 				// Check if there are any conflicting events at the same time
// 				// const existingEvents = await calendar.events.list({
// 				//   auth: oAuth2Client,
// 				//   calendarId: "primary",
// 				//   timeMin: event.start.dateTime,
// 				//   timeMax: event.end.dateTime,
// 				//   maxResults: 1, // We only need to check if there's at least one event
// 				//   singleEvents: true,
// 				// });

// 				// if (existingEvents.data.items.length > 0) {
// 				//   console.log('Skipping event creation because there is already an event at that time.');
// 				//   continue; // Skip inserting event and move to the next refreshToken
// 				// }

// 				// Insert the new event if no conflicting events found
// 				const createdEvent = await calendar.events.insert({
// 					auth: oAuth2Client,
// 					calendarId: "primary",
// 					requestBody: eventWithoutAttendees,
// 				});

// 				console.log("Calendar Event Created: ", createdEvent.data);
// 				// response['token'] = createdEvent.data;
// 				// break; // Exit loop after successful event creation
// 			} catch (error) {
// 				console.error("Error While Creating Event In Calendar: ", error);
// 			}
// 		}
// 	}

// 	return response;
// }

async function deleteCalendarEvent(eventId, refreshToken) {
	try {
		console.log(
			`Deleting calendar event with ID: ${eventId} using refresh token: ${refreshToken}`
		);
		oAuth2Client.setCredentials({ refresh_token: refreshToken });

		// First, try to retrieve the event to check if it exists
		const event = await calendar.events.get({
			auth: oAuth2Client,
			calendarId: "primary",
			eventId: eventId,
		});

		if (!event) {
			console.log(`Event with ID ${eventId} not found. Skipping deletion.`);
			return;
		}

		// Proceed with deletion if the event exists
		const response = await calendar.events.delete({
			auth: oAuth2Client,
			calendarId: "primary",
			eventId: eventId,
		});

		console.log(`Calendar Event Deleted: ${eventId}`);
		console.log(`Response from Calendar API: ${JSON.stringify(response.data)}`);
	} catch (error) {
		if (error.code === 410 || error.code === 404) {
			console.log(`Event ${eventId} has already been deleted or not found.`);
		} else {
			console.error(
				`Error While Deleting Event In Calendar with ID: ${eventId}: ${error.message}`
			);
			console.error(error.response ? error.response.data : error);
		}
	}
}

async function getValidateToken(body) {
	try {
		const { user } = body;

		let adminOAuthEntry = await UserOAuth.findOne({
			where: { user_id: user.id, role_id: user.role_id },
		});
		if (!adminOAuthEntry) {
			throw new Error("Invalid User Id");
		}
		return adminOAuthEntry.validate_token;
	} catch (error) {
		throw new Error("Invalid User Id");
	}
}

module.exports = {
	getAuthorizationUrl,
	authorize,
	listEvents,
	createCalendarEvent,
	getAdminAuthorizationUrl,
	adminAuthorize,
	deleteCalendarEvent,
	getValidateToken,
};
