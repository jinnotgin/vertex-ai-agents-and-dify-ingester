// import { DateTime, IANAZone } from "luxon";
import logger from "#lib/logger.js";

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

export function buildUrl(baseUrl, path, params = {}) {
	const QUERY_PARAMS_START = path.includes("?") ? "&" : "?";

	const queryString = Object.keys(params).length
		? QUERY_PARAMS_START +
		  Object.entries(params)
				.map(
					([key, value]) =>
						`${encodeURIComponent(key)}=${encodeURIComponent(value)}`
				)
				.join("&")
		: "";

	return `${baseUrl}${path}${queryString}`;
}

export async function retryAsyncFunction(func, settings, ...args) {
	const { retries = 5, delay = 500 } = settings || {};

	return new Promise(async (resolve, reject) => {
		try {
			const result = await func(...args);
			resolve(result);
		} catch (error) {
			if (retries > 0) {
				logger.error(`Error: ${error.message}`);
				logger.info(
					`Retrying after ${delay} milliseconds... attempts left: ${retries}`
				);
				await sleep(delay); // Sleep for delay milliseconds
				const newSettings = {retries: retries - 1, delay: delay * 2};
				resolve(retryAsyncFunction(func, newSettings, ...args)); // Double the delay for the next retry
			} else {
				reject("No more retries left. Function failed: " + error);
			}
		}
	});
}

export class RateLimiter {
	constructor(requestsPerMinute) {
			this.capacity = requestsPerMinute; // maximum number of tokens in the bucket
			this.tokens = requestsPerMinute;   // initial tokens in the bucket
			this.fillInterval = 60000 / requestsPerMinute; // interval in milliseconds to add a token
			this.lastRefill = Date.now();
	}

	async delay() {
			logger.info(`Rate Limit Tokens left: ${this.tokens}`);
			this.refillTokens();

			if (this.tokens > 0) {
					this.tokens--;
			} else {
					const now = Date.now();
					const nextRefillTime = this.lastRefill + this.fillInterval;
					const waitTime = nextRefillTime - now;

					logger.info(`Rate limit of ${this.capacity}/min reached. Sleeping for ${waitTime} milliseconds.`);
					await sleep(waitTime);

					this.refillTokens();
					this.tokens--;
			}
	}

	refillTokens() {
			const now = Date.now();
			const elapsedTime = now - this.lastRefill;

			if (elapsedTime > 0) {
					const tokensToAdd = Math.floor(elapsedTime / this.fillInterval);
					this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
					this.lastRefill = now - (elapsedTime % this.fillInterval);
			}
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
