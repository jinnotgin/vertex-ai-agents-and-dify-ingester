import {
	JIRA_GET_ISSUE_ENDPOINT,
	JIRA_GET_ISSUE_COMMENTS_ENDPOINT,
} from "#lib/constants.js";
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

const BASE_HEADERS = {
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
			headers: { ...BASE_HEADERS, ...headers },
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

// Helper function for Jira GET requests with results (listing of objects)
async function getRequestResults(url, resultsKey = "results", headers = {}) {
	try {
		logger.info("getRequestResults: Fetching", { url });
		const response = await fetch(url, {
			method: "GET",
			headers: { ...BASE_HEADERS, ...headers },
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

async function getIssueById(issueId) {
	const url = buildUrl(JIRA_GET_ISSUE_ENDPOINT.replace("{id}", issueId), {
		// expand: "renderedFields, names",
		expand: "renderedFields",
	});
	const data = await getRequest(url);

	if (!data) {
		logger.error(`Error in getIssueById: No results found`);
	}

	// TODO: pending refactor, this should be passed in from config
	const customFieldsMap = {
		Epic: "customfield_10014",
		"Story Points": "customfield_10036",
	};

	const issueTypeName = data?.fields?.issuetype?.name; // "Story"
	const projectName = data?.fields?.project?.name; // "SLS"
	const labels = data?.fields?.labels || [];

	const key = data?.key;
	const title = data?.fields?.summary;
	const description = data?.renderedFields?.description;
	const createdTime = data?.fields?.created;
	const updatedTime = data?.fields?.updated;

	// we are not processing comments here, as it doesnt return "expandedBody" HTML version of the comments
	// hence, we will give a count. other codes can use this info to trigger subsequent comments api call
	const commentsCount = (data?.fields?.comment?.comments || []).length;

	const customFields = {};
	for (let [fieldName, fieldKey] of Object.entries(customFieldsMap)) {
		customFields[fieldName] = data?.fields?.[fieldKey];
	}

	const attachments = (data?.fields?.attachment || []).map((attachment) => {
		return {
			mimeType: attachment?.mimeType,
			filename: attachment?.filename,
			createdTime: attachment?.created,
			contentRestLink: attachment?.content,
		};
	});

	return {
		key,
		issueTypeName,
		title,
		description,
		projectName,
		labels,
		createdTime,
		updatedTime,
		commentsCount,
		attachments,
		...customFields,
	};
}

async function getIssueCommentsById(issueId) {
	const url = buildUrl(
		JIRA_GET_ISSUE_COMMENTS_ENDPOINT.replace("{id}", issueId),
		{
			expand: "renderedBody",
		}
	);
	const data = await getRequestResults(url, "comments");

	if (!data) {
		logger.error(`Error in getIssueCommentsById: No results found`);
	}

	const comments = data.map((comment) => {
		return {
			author: comment?.author?.displayName,
			contentBody: comment?.renderedBody,
			createdTime: comment?.created,
			updatedTime: comment?.updated,
		};
	});

	return comments;
}

// TODO: Untested!
async function downloadAndSaveAttachment(downloadUrl, filePath) {
	await downloadAndSaveAs(downloadUrl, filePath, BASE_HEADERS);
}

export { getIssueById, getIssueCommentsById, downloadAndSaveAttachment };

console.log(await getIssueById("SLS-9986"));
console.log(await getIssueCommentsById("SLS-9986"));
console.log(await getIssueById("SLSTEST-22392"));
