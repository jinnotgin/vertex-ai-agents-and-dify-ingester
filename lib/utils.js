// import { DateTime, IANAZone } from "luxon";

export function removeRepeatedSpaces(text) {
	return text.replace(/( |\xa0)+/g, " ");
}

export async function sleep(milliseconds) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, milliseconds);
	});
}

export async function loadSecrets() {
	if (process.env.USE_GCP_SECRETS === "true") {
		return import("/etc/secrets/latest.mjs");
	} else {
		return import(`#secrets.js`);
	}
}

// export function formatDate(dateInput) {
// 	if (dateInput === null) {
// 		return null;
// 	}

// 	// Convert input to string if it's not already
// 	const date_string = String(dateInput);

// 	// Check if the date string is a Unix timestamp
// 	if (/^\d+$/.test(date_string)) {
// 		const date = DateTime.fromMillis(parseInt(date_string), { zone: "utc" });
// 		return date.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZZ");
// 	} else {
// 		const ianaZone = IANAZone.create("Asia/Singapore");
// 		for (const fmt of ["yyyy-MM-dd'T'HH:mm:ss.SSSZZ", "yyyy-MM-dd"]) {
// 			try {
// 				const date = DateTime.fromFormat(date_string, fmt, { zone: "utc" });
// 				if (fmt === "yyyy-MM-dd") {
// 					return date.setZone(ianaZone).toFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZZ");
// 				}
// 				return date.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZZ");
// 			} catch (error) {
// 				continue;
// 			}
// 		}
// 		throw new Error(`Date format not recognized: ${date_string}`);
// 	}
// }
