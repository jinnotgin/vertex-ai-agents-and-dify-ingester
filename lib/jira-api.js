import {} from "#lib/constants.js";
import { downloadAndSaveAs } from "#lib/diskio.js";
import logger from "#lib/logger.js";

import { loadSecrets, buildUrl as _buildUrl } from "#lib/utils.js";
const {
	ATLASSIAN_CLOUD_URL,
	ATLASSIAN_ACCOUNT_USERNAME,
	ATLASSIAN_ACCOUNT_API_TOKEN,
} = await loadSecrets();

// Base64 Encoding for Basic Auth
const basicAuthString = Buffer.from(
	ATLASSIAN_ACCOUNT_USERNAME + ":" + ATLASSIAN_ACCOUNT_API_TOKEN
).toString("base64");

const baseHeaders = {
	"Content-Type": "application/json",
	Authorization: `Basic ${basicAuthString}`,
};

function buildUrl(path, params = {}) {
	return _buildUrl(ATLASSIAN_CLOUD_URL, path, params);
}

// Helper function for Jira GET requests that return a single object
async function getRequest(url, headers = {}) {
	try {
		logger.info("getRequest: Fetching", { url });
		const response = await fetch(url, {
			method: "GET",
			headers: { ...baseHeaders, ...headers },
		});

		if (response.ok) {
			const data = await response.json();
			logger.info(`getRequestResults: Successfully fetched.`);

			return data;
		} else {
			logger.error(`getRequestResults: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Jira GET request`, { error });
	}
}

// Helper function for Jira GET requests with results
async function getRequestResults(url, resultsKey = "results", headers = {}) {
	try {
		logger.info("getRequestResults: Fetching", { url });
		const response = await fetch(url, {
			method: "GET",
			headers: { ...baseHeaders, ...headers },
		});

		if (response.ok) {
			const json = await response.json();
			const results = json?.[resultsKey] || [];
			logger.info(`getRequestResults: ${results.length} results found.`);

			const { startAt, maxResults, total } = json;
			const hasNextPage = startAt + maxResults < total;

			let nextResults = [];
			if (hasNextPage) {
				const nextPageLink = buildUrl(url, {
					startAt: startAt + maxResults + 1,
				});
				logger.info("More results available", { nextPageLink });
				nextResults = await getRequestResults(buildUrl(nextPageLink), headers);
			}

			return [...results, ...nextResults];
		} else {
			logger.error(`getRequestResults: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Jira GET request`, { error });
	}
}
