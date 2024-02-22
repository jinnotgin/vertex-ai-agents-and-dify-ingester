import {
	getIssuesByJQL,
	getIssueByKey,
	getIssueCommentsByKey,
	downloadAndSaveAttachment,
	getAllEpics,
	getIssuesSummaryFromEpicKey_SLS,
} from "#lib/jira-api.js";

import { getTestSteps as zephyr_getTestSteps } from "#lib/zephyr-api.js";

import {
	getFilePath,
	saveAsText,
	appendAsText,
	getFilenameFromPath,
} from "#lib/diskio.js";

import { sleep } from "#lib/utils.js";
import { ALLOWED_FILE_EXTENSION_TYPE_MAP } from "#lib/constants.js";
import logger from "#lib/logger.js";

import { loadSecrets } from "#lib/utils.js";
const { GCS_BUCKET_NAME } = await loadSecrets();

const SOURCE_PREFIX = "jira-cloud";
const DELAY_TIME = 0;

function saveMetadata(
	functionName,
	id,
	title,
	webUrl,
	createdAt,
	mimeType,
	fileName,
	customData = {}
) {
	const metadata = {
		id,
		structData: {
			title,
			webUrl,
			createdAt,
			...customData,
		},
		content: {
			mimeType,
			uri: `gs://${GCS_BUCKET_NAME}/${functionName}/${fileName}`,
		},
	};

	const metadataFilePath = getFilePath(functionName, "0metadata", "ndjson");
	appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
}

async function crawlJql(
	functionName,
	jql,
	includeComments = false,
	includeZephyrTestSteps = false
) {
	// TODO: to extract to config file
	const customFieldsMap = {
		Epic: "customfield_10014",
		"Story Points": "customfield_10036",
	};

	try {
		let hasNextPage = true;
		let startAt = 0;
		while (hasNextPage) {
			const { issues, pagination } = await getIssuesByJQL(
				jql,
				customFieldsMap,
				startAt
			);
			logger.info(
				`crawlJql: Found ${issues.length} issues, starting from ${startAt}`
			);

			for (const issue of issues) {
				const {
					key,
					issueTypeName,
					title,
					description,
					projectName,
					labels = [],
					createdAt,
					updatedAt,
					webUrl,
				} = issue;
				// attachments in jira, while returned, are not handled yet

				let fileBody = [
					`Issue Key: ${key}`,
					`Issue Type: ${issueTypeName}`,
					`Title: ${title}`,
					`Project Name: ${projectName}`,
					labels.length > 0 ? `Labels: ${(labels || []).join(", ")}` : null,
					`Created Time: ${createdAt}`,
					`Updated Time: ${updatedAt}`,
					...Object.keys(customFieldsMap).map((keyName) => {
						const keyValue = issue?.[keyName];
						return keyValue ? `${keyName}: ${keyValue}` : null;
					}),
					description ? `Description: \n${description}` : null,
				]
					.filter((item) => item !== null)
					.join("\n\n");

				if (includeZephyrTestSteps) {
					const testSteps = await zephyr_getTestSteps(key);

					if (testSteps.length > 0) {
						const testStepsBody = testSteps
							.map(({ step, data, result }, index) => {
								console.log({ step, data, result });
								return [
									`Test Number: ${index + 1}`,
									step ? `Test Step: \n${step}` : null,
									data ? `Test Data: \n${data}` : null,
									result ? `Test Result: \n${result}` : null,
								].join("\n\n");
							})
							.filter((item) => item !== null)
							.join("\n===\n");

						fileBody += `\n\n\Zephyr Tests Scenarios:\n=====\n${testStepsBody}\n=====\n`;
					}
				}

				if (includeComments) {
					const comments = await getIssueCommentsByKey(key);

					if (comments.length > 0) {
						const commentsBody = comments
							.map(({ author, content, updatedAt }, index) => {
								return [
									`Comment Number: ${index + 1}`,
									`Comment Author: ${author}`,
									`Comment Updated Time: ${updatedAt}`,
									`Comment Body: \n${content}`,
								].join("\n\n");
							})
							.join("\n=====\n");

						fileBody += `\n\nComments:\n=====\n${commentsBody}\n=====\n`;
					}
				}

				const filePath = getFilePath(
					functionName,
					`${SOURCE_PREFIX} ${key}`,
					"html"
				);
				const fileName = getFilenameFromPath(filePath);

				logger.info(`crawlJql: Saving ${filePath} with metadata update`);
				saveAsText(fileBody, filePath);
				saveMetadata(
					functionName,
					key,
					`[${key}] ${title}`,
					webUrl,
					createdAt,
					"text/html",
					fileName,
					{ updatedAt }
				);
			}

			hasNextPage = pagination?.hasNextPage || false;
			startAt = pagination?.nextStartAt;

			if (hasNextPage) {
				await sleep(DELAY_TIME);
			}
		}

		logger.info(`crawlJql: ${functionName} - Found all issues for ${jql}`);
	} catch (error) {
		logger.error(`crawlJql: Error: ${error.message}`);
	}
}

async function crawlEpicIssueSummary_SLS(functionName) {
	try {
		const epics = await getAllEpics("SLS");
		logger.info(
			`crawlEpicIssueSummary_SLS: Found ${epics.length} epics for SLS`
		);

		for (const { key, title, webUrl, createdAt, updatedAt } of epics) {
			const issuesInEpic = await getIssuesSummaryFromEpicKey_SLS(key);
			if (issuesInEpic.length === 0) {
				logger.info(
					`crawlEpicIssueSummary_SLS: Found no user stories for ${key}, skipping.`
				);
				continue;
			}

			const filePath = getFilePath(
				functionName,
				`${SOURCE_PREFIX} ${key}`,
				"html"
			);
			const fileName = getFilenameFromPath(filePath);
			const fileBody = `Epic ID: ${key}\nEpic Title: ${title}\n=====\nListing of User Stories:\n\n`;
			saveAsText(fileBody, filePath);
			saveMetadata(
				functionName,
				key,
				`[${key}] Epic: ${title}`,
				webUrl,
				createdAt,
				"text/html",
				fileName,
				{ updatedAt }
			);
			logger.info(
				`crawlEpicIssueSummary_SLS: Saving ${filePath} with metadata update`
			);

			for (const issueData of issuesInEpic) {
				const { key, title, updatedAt } = issueData;

				const fileBody = `${key}: ${title} [Last Updated On: ${updatedAt}]\n`;
				appendAsText(fileBody, filePath);
			}
			logger.info(
				`crawlEpicIssueSummary_SLS: Updated ${filePath} with ${issuesInEpic.length} user stories summary data.`
			);
		}
		logger.info(
			`crawlEpicIssueSummary_SLS: ${functionName} - Found all epics and their user stories.`
		);
	} catch (error) {
		logger.error(`crawlEpicIssueSummary_SLS: Error: ${error.message}`);
	}
}

export { crawlJql, crawlEpicIssueSummary_SLS };

// await crawlJql(
// 	"test",
// 	"project = SLS AND status = Done ORDER BY updated DESC",
// 	true
// );

// await crawlEpicIssueSummary_SLS("test");
