import sha256 from "crypto-js/sha256.js";
import hmacSHA256 from "crypto-js/hmac-sha256.js";
import Utf8 from "crypto-js/enc-utf8.js";
import Base64 from "crypto-js/enc-base64.js";

import {
	ZEPHYR_SQUAD_BASE_URL,
	ZEPHYR_SQUAD_GET_TEST_STEPS_ENDPOINT,
} from "#lib/constants.js";
import logger from "#lib/logger.js";
import { getIssueByKey as jira_getIssueByKey } from "#lib/jira-api.js";
import { loadSecrets, buildUrl as _buildUrl } from "#lib/utils.js";
const {
	ZEPHYR_SQUAD_ACCESS_KEY,
	ZEPHYR_SQUAD_SECRET_KEY,
	ZEPHYR_SQUAD_ATLASSIAN_ACCOUNT_ID,
} = await loadSecrets();

const CACHE = {
	JIRA_PROJECT_ID: {},
};

function buildUrl(path, params = {}) {
	return _buildUrl(ZEPHYR_SQUAD_BASE_URL, path, params);
}

function base64url(source) {
	// adapted from https://github.com/masudjbd/zapi-javascript-jwt/tree/master

	// Encode in classical base64
	let encodedSource = Base64.stringify(source);

	// Remove padding equal characters
	encodedSource = encodedSource.replace(/=+$/, "");

	// Replace characters according to base64url specifications
	encodedSource = encodedSource.replace(/\+/g, "-");
	encodedSource = encodedSource.replace(/\//g, "_");

	return encodedSource;
}

function generateJWT(
	BASE_URL,
	ACCESS_KEY,
	SECRET_KEY,
	ACCOUNT_ID,
	JWT_EXPIRE = 3600,
	METHOD,
	API_URI
) {
	// adapted from https://github.com/masudjbd/zapi-javascript-jwt/tree/master

	// yes, the below is not the most efficient. im keeping it as a reminder to understand how this whole mess works
	// the documenation behind "CANONICAL_PATH" is not very clear from existing docs
	// https://zephyrsquad.docs.apiary.io/
	var API_PATH_parts = API_URI.split(BASE_URL)[1].split("?");
	const RELATIVE_PATH = API_PATH_parts[0];
	const QUERY_STRING = API_PATH_parts[1];

	let CANONICAL_PATH;
	if (QUERY_STRING) {
		CANONICAL_PATH = METHOD + "&" + RELATIVE_PATH + "&" + QUERY_STRING;
	} else {
		CANONICAL_PATH = METHOD + "&" + RELATIVE_PATH + "&";
	}

	const header = {
		alg: "HS256",
		typ: "JWT",
	};

	const jwt_payload = {
		sub: ACCOUNT_ID,
		qsh: sha256(CANONICAL_PATH).toString(),
		iss: ACCESS_KEY,
		exp: new Date().getTime() + JWT_EXPIRE,
		iat: new Date().getTime(),
	};

	const stringifiedHeader = Utf8.parse(JSON.stringify(header));
	const encodedHeader = base64url(stringifiedHeader);

	const stringifiedData = Utf8.parse(JSON.stringify(jwt_payload));
	const encodedData = base64url(stringifiedData);

	const token = `${encodedHeader}.${encodedData}`;

	let signature = hmacSHA256(token, SECRET_KEY);
	signature = base64url(signature);

	const signedToken = `${token}.${signature}`;

	return signedToken;
}

export function generateHeaders(METHOD, FULL_API_URI) {
	const token = generateJWT(
		ZEPHYR_SQUAD_BASE_URL,
		ZEPHYR_SQUAD_ACCESS_KEY,
		ZEPHYR_SQUAD_SECRET_KEY,
		ZEPHYR_SQUAD_ATLASSIAN_ACCOUNT_ID,
		3600,
		METHOD,
		FULL_API_URI
	);

	return {
		"Content-Type": "application/json",
		Authorization: `JWT ${token}`,
		zapiAccessKey: ZEPHYR_SQUAD_ACCESS_KEY,
	};
}

// Helper function for Zephyr GET requests
async function getRequest(url) {
	try {
		logger.info("getRequest: Fetching", { url });
		const authHeaders = generateHeaders("GET", url);
		const response = await fetch(url, {
			method: "GET",
			headers: { ...authHeaders },
		});

		if (response.ok) {
			const data = await response.json();
			logger.info(`getRequest: Successfully fetched.`);

			return data;
		} else {
			logger.error(`getRequest: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Zephyr GET request: ${error.message}`);
	}
}

async function getTestSteps(issueKey) {
	const issueData = await jira_getIssueByKey(issueKey);
	if (!issueData) {
		logger.error(
			`Error in getTestSteps: Cannot get issue data for ${issueKey}`
		);
	}

	const { id: issueId = null, projectId = null } = issueData;
	if (!issueId || !projectId) {
		logger.error(
			`Error in getTestSteps: Cannot get issue ID / project ID for ${issueKey}`
		);
	}
	const url = buildUrl(
		ZEPHYR_SQUAD_GET_TEST_STEPS_ENDPOINT.replace("{issueId}", issueId).replace(
			"{projectId}",
			projectId
		)
	);
	const data = await getRequest(url);

	const { testSteps = null } = data;
	if (!testSteps || !Array.isArray(testSteps)) {
		logger.error(
			`Error in getTestSteps: Cannot get test steps for ${issueKey}`
		);
	}

	// sort test steps in ascending order ID
	testSteps.sort((a, b) => a.orderId - b.orderId);

	logger.info(
		`getTestSteps: Found ${testSteps.length} test steps for ${issueKey}`
	);
	return testSteps;
}

export { getTestSteps };
