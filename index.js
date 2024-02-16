import "dotenv/config";
import {
	crawlAll as confluence_crawlAll,
	crawlSpaces as confluence_crawlSpaces,
	crawlPages as confluence_crawlPages,
} from "#lib/confluence-dataProcessing.js";
import { crawlTargets } from "#config.js";
import { uploadFolderToGCS, refreshVertexDataStore } from "#lib/gcp-api.js";

import { loadSecrets } from "#lib/utils.js";
const { VERTEX_DATA_STORES } = await loadSecrets();

export async function main() {
	// const vertexDataStoresIds = Object.keys(VERTEX_DATA_STORES);

	const tasks = [];

	for (let [functionName, targets] of Object.entries(crawlTargets)) {
		for (let target of targets) {
			const { source, settings } = target;

			let task = (async () => {
				switch (source) {
					case "confluence-cloud": {
						const { type, items, options } = settings;
						switch (type) {
							case "all":
								await confluence_crawlAll(functionName);
								break;
							case "spaces":
								await confluence_crawlSpaces(functionName, items);
								break;
							case "pages":
								const { includeChildPages = false, excludePages = [] } =
									options;
								await confluence_crawlPages(
									functionName,
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
					}
					default:
						break;
				}
				// await uploadFolderToGCS(functionName);

				// if (vertexDataStoresIds.includes(functionName)) {
				// 	await refreshVertexDataStore(
				// 		VERTEX_DATA_STORES[functionName],
				// 		functionName
				// 	);
				// }
			})();

			tasks.push(task);
		}
	}

	return await Promise.all(tasks);
}
