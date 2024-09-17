import "dotenv/config";
import logger from "#lib/logger.js";
import {
	crawlAll as confluence_crawlAll,
	crawlSpaces as confluence_crawlSpaces,
	crawlPages as confluence_crawlPages,
} from "#lib/confluence-dataProcessing.js";
import {
	crawlJql as jira_crawlJql,
	crawlEpicIssueSummary_SLS as jira_crawlEpicIssueSummary_SLS,
} from "#lib/jira-dataProcessing.js";
import { crawlUrl as web_crawlUrl } from "#lib/web-dataProcessing.js";
import { crawlTargets } from "#config.js";
import { uploadFolderToGCS, refreshVertexDataStore } from "#lib/gcp-api.js";
import { difyPurgeDataStore, uploadFolderToDify } from "#lib/dify-api.js";
import { clearDataDirectory } from "#lib/diskio.js";
import { loadSecrets, sleep } from "#lib/utils.js";
import { convertMetadataToSqlite } from "#lib/ndjson-to-sqlite.js";

const { VERTEX_DATA_STORES, DIFY_DATASET_IDS } = await loadSecrets();

export async function main() {
	const vertexDataStoresIds = Object.keys(VERTEX_DATA_STORES);
	const difyDatasetIds = Object.keys(DIFY_DATASET_IDS);

	const tasks = [];

	for (let [crawlTargetName, targetConfig] of Object.entries(crawlTargets)) {
		const { uploadDestination, targets } = targetConfig;
		clearDataDirectory(crawlTargetName);

		// Create a task for each crawlTarget to manage its targets, upload, and refresh operations
		let task = (async () => {
			const subTasks = []; // To store promises of each target's (in targets) operations

			for (let target of targets) {
				const { source, settings } = target;
				// Create a sub-task for each target
				let subTask = (async () => {
					switch (source) {
						case "confluence-cloud": {
							const { type, items, options } = settings;
							const { bannedAttachmentPatterns = [] } =
							options || {};
							switch (type) {
								case "all":
									await confluence_crawlAll(crawlTargetName, bannedAttachmentPatterns);
									break;
								case "spaces":
									await confluence_crawlSpaces(crawlTargetName, items, bannedAttachmentPatterns);
									break;
								case "pages":
									const { includeChildPages = false, excludePages = [] } =
										options || {};
									await confluence_crawlPages(
										crawlTargetName,
										items,
										includeChildPages,
										excludePages,
										bannedAttachmentPatterns,
									);
									break;
								default:
									break;
							}
							break;
						}
						case "jira-cloud": {
							const { type, items, options } = settings;
							switch (type) {
								case "jql":
									const {
										includeComments = false,
										includeZephyrTestSteps = false,
									} = options;
									for (const jql of items) {
										await jira_crawlJql(
											crawlTargetName,
											jql,
											includeComments,
											includeZephyrTestSteps
										);
									}
									break;
								case "epic-issue-summary-SLS":
									await jira_crawlEpicIssueSummary_SLS(crawlTargetName);
									break;
								default:
									break;
							}
							break;
						}
						case "web": {
							const { type, items, options } = settings;
							switch (type) {
								case "url":
									const { includeLinks = false, regex, bannedUrlPatterns = [], bannedTitlePatterns = [], depth = 1 } = options || {};
									for (const url of items) {
										await web_crawlUrl(
											crawlTargetName,
											url,
											includeLinks,
											new RegExp(regex),
											bannedUrlPatterns.map(pattern => new RegExp(pattern)),
											bannedTitlePatterns.map(pattern => new RegExp(pattern)),
											depth
										);
									}
									break;
								default:
									break;
							}
							break; // Add break to prevent fallthrough
						}
						default:
							break;
					}
				})();
				subTasks.push(subTask);
			}

			// Wait for all targets within this targetGroup to complete
			await Promise.all(subTasks);

			// After the entire targetGroup is processed, proceed with upload and refresh
			if (uploadDestination === "gcp") {
				await uploadFolderToGCS(crawlTargetName);

				if (vertexDataStoresIds.includes(crawlTargetName)) {
					await refreshVertexDataStore(
						VERTEX_DATA_STORES[crawlTargetName],
						crawlTargetName
					);
				}
			} else if (uploadDestination === "dify") {
				// prepare a sqlite file for ndjson data
				await convertMetadataToSqlite(crawlTargetName);

				if (difyDatasetIds.includes(crawlTargetName)) {
					await difyPurgeDataStore(DIFY_DATASET_IDS[crawlTargetName]);

					await sleep(5000); 
					await uploadFolderToDify(
						DIFY_DATASET_IDS[crawlTargetName],
						crawlTargetName
					);
				}
			}
		})();

		tasks.push(task);
	}

	const allTasksCompleted = await Promise.all(tasks);
	logger.info("All tasks completed. Function will end now.");

	return allTasksCompleted;
}

// HTTP Handler function for Cloud Function
export async function httpHandler(req, res) {
  try {
    await main();
    res.status(200).send("All tasks completed successfully.");
  } catch (error) {
    logger.error("An error occurred:", error);
    res.status(500).send("An error occurred while processing the tasks.");
  }
}

