import "dotenv/config";
import {
	crawlAll as confluence_crawlAll,
	crawlSpaces as confluence_crawlSpaces,
	crawlPages as confluence_crawlPages,
} from "#lib/confluence-dataProcessing.js";
import {
	crawlJql as jira_crawlJql,
	crawlEpicIssueSummary_SLS as jira_crawlEpicIssueSummary_SLS,
} from "#lib/jira-dataProcessing.js";
import { crawlTargets } from "#config.js";
import { uploadFolderToGCS, refreshVertexDataStore } from "#lib/gcp-api.js";
import { clearDataDirectory } from "#lib/diskio.js";

import { loadSecrets } from "#lib/utils.js";
const { VERTEX_DATA_STORES } = await loadSecrets();

export async function main() {
	const vertexDataStoresIds = Object.keys(VERTEX_DATA_STORES);

	const tasks = [];

	for (let [crawlTargetName, targetGroup] of Object.entries(crawlTargets)) {
		clearDataDirectory(crawlTargetName);

		// Create a task for each crawlTarget to manage its targetGroup, upload, and refresh operations
		let task = (async () => {
			const subTasks = []; // To store promises of each target's (in targetGroup) operations

			for (let target of targetGroup) {
				const { source, settings } = target;
				// Create a sub-task for each target
				let subTask = (async () => {
					switch (source) {
						case "confluence-cloud": {
							const { type, items, options } = settings;
							switch (type) {
								case "all":
									await confluence_crawlAll(crawlTargetName);
									break;
								case "spaces":
									await confluence_crawlSpaces(crawlTargetName, items);
									break;
								case "pages":
									const { includeChildPages = false, excludePages = [] } =
										options;
									await confluence_crawlPages(
										crawlTargetName,
										items,
										includeChildPages,
										excludePages
									);
									break;
								default:
									break;
							}
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
			await uploadFolderToGCS(crawlTargetName);

			if (vertexDataStoresIds.includes(crawlTargetName)) {
				await refreshVertexDataStore(
					VERTEX_DATA_STORES[crawlTargetName],
					crawlTargetName
				);
			}
		})();

		tasks.push(task);
	}

	return await Promise.all(tasks);
}
