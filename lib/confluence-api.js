import {
	CONFLUENCE_GET_ALL_SPACES_ENDPOINT,
	CONFLUENCE_GET_ALL_PAGES_ENDPOINT,
	CONFLUENCE_GET_ALL_ATTACHMENTS_ENDPOINT,
	CONFLUENCE_GET_PAGE_BY_ID_ENDPOINT,
	CONFLUENCE_GET_CHILD_PAGES_ENDPOINT,
	CONFLUENCE_GET_ALL_ATTACHMENTS_FOR_PAGE_ENDPOINT,
} from "#lib/constants.js";
import { downloadAndSaveAs } from "#lib/diskio.js";
import logger from "#lib/logger.js";

import {
	loadSecrets,
	buildUrl as _buildUrl,
	retryAsyncFunction,
} from "#lib/utils.js";
const {
	ATLASSIAN_CLOUD_URL,
	ATLASSIAN_ACCOUNT_USERNAME,
	ATLASSIAN_ACCOUNT_API_TOKEN,
} = await loadSecrets();

const RETRY_ASYNC_FUNCTION_SETTINGS = {}; // keep as default settings

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

// Helper function for Confluence GET requests that return a single object
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
		logger.error(`Error in Confluence GET request: ${error.message}`);
	}
}

// Helper function for Confluence GET requests with results
async function getRequestResults(url, headers = {}) {
	try {
		logger.info("getRequestResults: Fetching", { url });
		const response = await fetch(url, {
			method: "GET",
			headers: { ...baseHeaders, ...headers },
		});

		if (response.ok) {
			const json = await response.json();
			const results = json?.results || [];
			logger.info(`getRequestResults: ${results.length} results found.`);

			let nextResults = [];
			const nextPageLink = json?._links?.next;
			if (nextPageLink) {
				logger.info("More results available", { nextPageLink });
				nextResults = await getRequestResults(buildUrl(nextPageLink), headers);
			}

			return [...results, ...nextResults];
		} else {
			logger.error(`getRequestResults: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Confluence GET request: ${error.message}`);
	}
}

async function _getAllSpaces() {
	const url = buildUrl(CONFLUENCE_GET_ALL_SPACES_ENDPOINT, {
		type: "global",
		status: "current",
		limit: 250,
	});
	const results = await getRequestResults(url);

	if (results) {
		const output = results.map(({ id, key, name, homepageId }) => {
			return { id, key, name, homepageId };
		});
		return output;
	} else {
		logger.error(`Error in getAllSpaces: No results found`);
	}
}
async function getAllSpaces() {
	return await retryAsyncFunction(_getAllSpaces, RETRY_ASYNC_FUNCTION_SETTINGS);
}

// Helper function to create page objects
function createPageObject(data) {
	const { id, title, spaceId } = data;

	let relativeWebUrl = data?._links?.webui || "";
	if (relativeWebUrl.includes("/pages/")) {
		const urlMatches = relativeWebUrl.match(/\/spaces\/\w+\/pages\/\d+/);
		if (urlMatches) {
			relativeWebUrl = `/wiki${urlMatches[0]}`;
		}
	}
	const webUrl = `${ATLASSIAN_CLOUD_URL}${relativeWebUrl}`;

	return {
		id,
		title,
		body: data?.body?.storage?.value,
		webUrl,
		createdAt: data?.version?.createdAt,
		spaceId,
	};
}

async function _getAllPagesInSpace(spaceId) {
	const url = buildUrl(CONFLUENCE_GET_ALL_PAGES_ENDPOINT, {
		limit: 250,
		"space-id": spaceId,
		status: "current",
		"body-format": "storage",
	});
	const results = await getRequestResults(url);

	if (results) {
		return results.map((data) => createPageObject(data));
	} else {
		logger.error(`Error in getAllPagesInSpace: No results found`);
	}
}
async function getAllPagesInSpace(spaceId) {
	return await retryAsyncFunction(
		_getAllPagesInSpace,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		spaceId
	);
}

async function _getPageById(pageId) {
	const url = buildUrl(
		CONFLUENCE_GET_PAGE_BY_ID_ENDPOINT.replace("{id}", pageId),
		{ "body-format": "storage" }
	);
	const data = await getRequest(url);

	if (data) {
		return createPageObject(data);
	} else {
		logger.error(`Error in getPageId: No results found`);
	}
}
async function getPageById(pageId) {
	return await retryAsyncFunction(
		_getPageById,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		pageId
	);
}

async function _getChildPagesOfPageId(pageId) {
	const url = buildUrl(
		CONFLUENCE_GET_CHILD_PAGES_ENDPOINT.replace("{id}", pageId)
	);
	const data = await getRequest(url);

	if (data) {
		const { results = [] } = data;
		const childPagesIds = results.map(({ id = "" }) => id);

		return childPagesIds;
	} else {
		logger.error(`Error in getChildPagesOfPageId: No results found`);
	}
}
async function getChildPagesOfPageId(pageId) {
	return await retryAsyncFunction(
		_getChildPagesOfPageId,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		pageId
	);
}

// Helper function to create attachment objects
function createAttachmentObject(data) {
	const { id, title, mediaType, pageId, fileId } = data;

	let { webuiLink: relativeWebUrl, downloadLink: relativeDownloadUrl } = data;

	const webUrl = `${ATLASSIAN_CLOUD_URL}/wiki${relativeWebUrl}`;
	const downloadUrl = `${ATLASSIAN_CLOUD_URL}/wiki${relativeDownloadUrl}`;

	return {
		id,
		title,
		mediaType,
		webUrl,
		downloadUrl,
		createdAt: data?.version?.createdAt,
		pageId,
		fileId,
	};
}

async function _getAllAttachments(mediaType) {
	const url = buildUrl(CONFLUENCE_GET_ALL_ATTACHMENTS_ENDPOINT, {
		limit: 250,
		status: "current",
		mediaType,
	});
	const results = await getRequestResults(url);

	if (results) {
		const output = results.map((data) => {
			return createAttachmentObject(data);
		});
		return output;
	} else {
		logger.error(`Error in getAllAttachments: No results found`);
	}
}
async function getAllAttachments(mediaType) {
	return await retryAsyncFunction(
		_getAllAttachments,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		mediaType
	);
}

async function _getAllAttachmentsForPage(pageId) {
	const url = buildUrl(
		CONFLUENCE_GET_ALL_ATTACHMENTS_FOR_PAGE_ENDPOINT.replace("{id}", pageId),
		{
			limit: 250,
			status: "current",
		}
	);
	const results = await getRequestResults(url);

	if (results) {
		const output = results.map((data) => {
			return createAttachmentObject(data);
		});
		return output;
	} else {
		logger.error(`Error in getAllAttachments: No results found`);
	}
}
async function getAllAttachmentsForPage(pageId) {
	return await retryAsyncFunction(
		_getAllAttachmentsForPage,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		pageId
	);
}

async function downloadAndSaveAttachment(downloadUrl, filePath) {
	return await retryAsyncFunction(
		downloadAndSaveAs,
		RETRY_ASYNC_FUNCTION_SETTINGS,
		downloadUrl,
		filePath,
		baseHeaders
	);
}

export {
	getAllSpaces,
	getAllPagesInSpace,
	getPageById,
	getChildPagesOfPageId,
	getAllAttachments,
	getAllAttachmentsForPage,
	downloadAndSaveAttachment,
};
