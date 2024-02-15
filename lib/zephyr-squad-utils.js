import sha256 from "crypto-js/sha256.js";
import hmacSHA256 from "crypto-js/hmac-sha256.js";
import Utf8 from "crypto-js/enc-utf8.js";
import Base64 from "crypto-js/enc-base64.js";

import { ZEPHYR_SQUAD_BASE_URL } from "#lib/constants.js";
import { loadSecrets } from "#lib/utils.js";
const {
	ZEPHYR_SQUAD_ACCESS_KEY,
	ZEPHYR_SQUAD_SECRET_KEY,
	ZEPHYR_SQUAD_ATLASSIAN_ACCOUNT_ID,
} = await loadSecrets();

// adapted from https://github.com/masudjbd/zapi-javascript-jwt/tree/master

function base64url(source) {
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

// const headers = generateHeaders(
// 	"GET",
// 	"https://prod-api.zephyr4jiracloud.com/connect/public/rest/api/2.0/teststep/67072?projectId=10002"
// );

// console.log(headers);
