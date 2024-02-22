import {
	JIRA_JQL_SEARCH_ENDPOINT,
	JIRA_GET_ISSUE_ENDPOINT,
	JIRA_GET_ISSUE_COMMENTS_ENDPOINT,
	JIRA_JQL_QUERY_TEMPLATES,
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

const ISSUE_NAMES_CACHE = {};

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
			logger.info(`getRequest: Successfully fetched.`);

			return data;
		} else {
			logger.error(`getRequest: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Jira GET request: ${error.message}`);
	}
}

// Helper function for Jira GET requests with results (listing of objects) with pagination
async function getRequestsResultsPaginated(
	url,
	resultsKey = "results",
	headers = {}
) {
	try {
		logger.info("getRequestsResultsPaginated: Fetching", { url });
		const response = await fetch(url, {
			method: "GET",
			headers: { ...BASE_HEADERS, ...headers },
		});

		if (response.ok) {
			const json = await response.json();
			const results = json?.[resultsKey] || [];
			logger.info(
				`getRequestsResultsPaginated: ${results.length} results found.`
			);

			const { startAt, maxResults, total } = json;
			const hasNextPage = startAt + maxResults < total;

			let nextResults = [];
			if (hasNextPage) {
				const nextPageLink = buildUrl(url, {
					startAt: startAt + maxResults,
				});
				logger.info("More results available", { nextPageLink });
				nextResults = await getRequestsResultsPaginated(
					nextPageLink,
					resultsKey,
					headers
				);
			}

			return [...results, ...nextResults];
		} else {
			logger.error(
				`getRequestsResultsPaginated: HTTP Error: ${response.status}`
			);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Jira GET request: ${error.message}`);
	}
}

// Helper function for Jira POST requests with results (listing of objects)
async function postRequestResults(
	url,
	payload,
	resultsKey = "results",
	headers = {}
) {
	try {
		logger.info("postRequestResults: Fetching", { url, payload });
		const response = await fetch(url, {
			method: "POST",
			headers: { ...BASE_HEADERS, ...headers },
			body: JSON.stringify(payload),
		});

		if (response.ok) {
			const json = await response.json();
			const results = json?.[resultsKey] || [];
			logger.info(`postRequestResults: ${results.length} results found.`);

			const { startAt, maxResults, total } = json;
			const hasNextPage = startAt + maxResults < total;

			let nextResults = [];
			if (hasNextPage) {
				const newPayload = { ...payload, startAt: startAt + maxResults };
				logger.info("More results available", { url, startAt });
				nextResults = await postRequestResults(
					url,
					newPayload,
					resultsKey,
					headers
				);
			}

			return [...results, ...nextResults];
		} else {
			logger.error(`postRequestResults: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in Jira POST request: ${error.message}`);
	}
}

async function getIssuesByJQL(jql, customFieldsMap, startAt = 0, headers = {}) {
	try {
		const response = await fetch(buildUrl(JIRA_JQL_SEARCH_ENDPOINT), {
			method: "POST",
			headers: { ...BASE_HEADERS, ...headers },
			body: JSON.stringify({
				jql,
				startAt,
				maxResults: 50,
				expand: ["renderedFields"],
				fields: [
					"issuetype",
					"project",
					"labels",
					"summary",
					"description",
					"created",
					"updated",
					"attachment",
					...Object.values(customFieldsMap),
				],
			}),
		});

		if (!response.ok) {
			logger.error(`getIssuesByJQL: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}

		const json = await response.json();
		startAt = json?.startAt || startAt;
		const { maxResults, total } = json;
		const hasNextPage = startAt + maxResults < total;
		const nextStartAt = hasNextPage ? startAt + maxResults : total;

		const issues = json.issues || [];
		const formattedIssues = issues.map((issue) => {
			const fields = issue.fields;
			const customFields = {};
			for (const [fieldName, fieldKey] of Object.entries(customFieldsMap)) {
				customFields[fieldName] = fields[fieldKey];
			}

			logger.info(`getIssuesByJQL: Prepared formmated data for ${issue.key}`);

			return {
				key: issue.key,
				issueTypeName: fields.issuetype?.name,
				title: fields?.summary,
				description: issue?.renderedFields?.description,
				projectName: fields?.project?.name,
				labels: fields?.labels,
				createdAt: fields?.created,
				updatedAt: fields?.updated,
				attachments: (fields?.attachment || []).map((attachment) => ({
					mimeType: attachment?.mimeType,
					filename: attachment?.filename,
					createdAt: attachment?.created,
					contentRestLink: attachment?.content,
				})),
				webUrl: `${ATLASSIAN_CLOUD_URL}/browse/${issue.key}`,
				...customFields,
			};
		});

		return {
			issues: formattedIssues,
			pagination: {
				startAt,
				maxResults,
				total,
				hasNextPage,
				nextStartAt,
			},
		};
	} catch (error) {
		logger.error(`Error in getIssuesByJQL: ${error.message}`);
		throw error; // Or handle error as needed
	}
}

async function getAllEpics(projectKey) {
	try {
		const results = await postRequestResults(
			buildUrl(JIRA_JQL_SEARCH_ENDPOINT),
			{
				jql: JIRA_JQL_QUERY_TEMPLATES.ALL_EPICS.replace(
					"{projectKey}",
					projectKey
				),
				maxResults: 1000,
				fields: ["summary", "created", "updated"],
			},
			"issues"
		);

		return results.map((issue) => {
			// ISSUE_NAMES_CACHE[issue.key] = issue?.fields?.summary;   // for future use?
			return {
				key: issue.key,
				title: issue?.fields?.summary,
				createdAt: issue?.fields?.created,
				updatedAt: issue?.fields?.updated,
				webUrl: `${ATLASSIAN_CLOUD_URL}/browse/${issue.key}`,
			};
		});
	} catch (error) {
		logger.error(`Error in getAllEpics: ${error.message}`);
		throw error; // Or handle error as needed
	}
}

// this function is custom for SLS setup
// TODO: in future, consider refactoring to a config file
async function getIssuesSummaryFromEpicKey_SLS(epicIssueKey) {
	try {
		const results = await postRequestResults(
			buildUrl(JIRA_JQL_SEARCH_ENDPOINT),
			{
				jql: JIRA_JQL_QUERY_TEMPLATES.STORIES_IN_EPIC_SLS.replace(
					"{epicIssueKey}",
					epicIssueKey
				),
				maxResults: 1000,
				fields: ["summary", "updated"],
			},
			"issues"
		);

		return results.map((issue) => {
			return {
				key: issue.key,
				title: issue?.fields?.summary,
				updatedAt: issue?.fields?.updated,
			};
		});
	} catch (error) {
		logger.error(`Error in getIssuesSummaryFromEpicKey_SLS: ${error.message}`);
		throw error; // Or handle error as needed
	}
}

async function getIssueByKey(issueKey) {
	// TODO: pending refactor, this should be passed in from config
	const customFieldsMap = {
		Epic: "customfield_10014",
		"Story Points": "customfield_10036",
	};

	const url = buildUrl(JIRA_GET_ISSUE_ENDPOINT.replace("{id}", issueKey), {
		// expand: "renderedFields, names",
		expand: "renderedFields",
	});
	const data = await getRequest(url);

	if (!data) {
		logger.error(`Error in getIssueByKey: No results found`);
	}

	const issueTypeName = data?.fields?.issuetype?.name; // "Story"
	const projectName = data?.fields?.project?.name; // "SLS"
	const projectId = data?.fields?.project?.id;
	const labels = data?.fields?.labels || [];

	const id = data?.id;
	const key = data?.key;
	const title = data?.fields?.summary;
	const description = data?.renderedFields?.description;
	const createdAt = data?.fields?.created;
	const updatedAt = data?.fields?.updated;

	// we are not processing comments here, as it doesnt return "expandedBody" HTML version of the comments
	// hence, we will give a count. other codes can use this info to trigger subsequent comments api call
	const commentsCount = (data?.fields?.comment?.comments || []).length;

	const webUrl = `${ATLASSIAN_CLOUD_URL}/browse/${key}`;

	const customFields = {};
	for (let [fieldName, fieldKey] of Object.entries(customFieldsMap)) {
		customFields[fieldName] = data?.fields?.[fieldKey];
	}

	const attachments = (data?.fields?.attachment || []).map((attachment) => {
		return {
			mimeType: attachment?.mimeType,
			filename: attachment?.filename,
			createdAt: attachment?.created,
			contentRestLink: attachment?.content,
		};
	});

	logger.info(`getIssueByKey: Prepared formmated data for ${issueKey}`);

	return {
		id,
		key,
		issueTypeName,
		title,
		description,
		projectName,
		projectId,
		labels,
		createdAt,
		updatedAt,
		commentsCount,
		attachments,
		webUrl,
		...customFields,
	};
}

async function getIssueCommentsByKey(issueKey) {
	const url = buildUrl(
		JIRA_GET_ISSUE_COMMENTS_ENDPOINT.replace("{id}", issueKey),
		{
			expand: "renderedBody",
		}
	);
	const data = await getRequestsResultsPaginated(url, "comments");
	logger.info(
		`getIssueCommentsByKey: Found ${data.length} comments for ${issueKey}`
	);

	if (!data) {
		logger.error(`Error in getIssueCommentsByKey: No results found`);
	}

	const comments = data.map((comment) => {
		return {
			author: comment?.author?.displayName,
			content: comment?.renderedBody,
			createdAt: comment?.created,
			updatedAt: comment?.updated,
		};
	});

	return comments;
}

// TODO: Untested!
async function downloadAndSaveAttachment(downloadUrl, filePath) {
	await downloadAndSaveAs(downloadUrl, filePath, BASE_HEADERS);
}

export {
	getIssuesByJQL,
	getIssueByKey,
	getIssueCommentsByKey,
	downloadAndSaveAttachment,
	getAllEpics,
	getIssuesSummaryFromEpicKey_SLS,
};

// console.log(await getIssueByKey("SLS-9986"));
// console.log(await getIssueCommentsByKey("SLS-9986"));
// console.log(await getIssueByKey("SLSTEST-22392"));
// console.log(
// 	await getIssuesByJQL("project = SLS AND status = Done ORDER BY updated DESC")
// );
