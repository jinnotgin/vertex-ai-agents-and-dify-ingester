import "dotenv/config";
import {
	crawlAll,
	crawlSpaces,
	crawlPages,
} from "#lib/confluence-dataProcessing.js";
import { crawlTargets } from "#config.js";
import { uploadFolderToGCS, refreshVertexDataStore } from "#lib/gcp-api.js";

import { loadSecrets } from "#lib/utils.js";
const { VERTEX_DATA_STORES } = await loadSecrets();

export async function main() {
	const vertexDataStoresIds = Object.keys(VERTEX_DATA_STORES);

	const tasks = [];

	for (let [functionName, data] of Object.entries(crawlTargets)) {
		const { type, items, options } = data;

		let task = (async () => {
			switch (type) {
				case "all":
					await crawlAll(functionName);
					break;
				case "spaces":
					await crawlSpaces(functionName, items);
					break;
				case "pages":
					const { includeChildPages = false, excludePages = [] } = options;
					await crawlPages(
						functionName,
						items,
						includeChildPages,
						excludePages
					);
					break;
				default:
					break;
			}
			await uploadFolderToGCS(functionName);

			if (vertexDataStoresIds.includes(functionName)) {
				await refreshVertexDataStore(
					VERTEX_DATA_STORES[functionName],
					functionName
				);
			}
		})();

		tasks.push(task);
	}

	return await Promise.all(tasks);
}
