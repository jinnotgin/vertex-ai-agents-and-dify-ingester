import "dotenv/config";
import {
	crawlAll,
	crawlSpaces,
	crawlPages,
} from "#lib/confluence-dataProcessing.js";
import { crawlTargets } from "#config.js";
import { VERTEX_DATA_STORE_IDS } from "#secrets.js";
import { uploadFolderToGCS, refreshVertexDataStore } from "#lib/gcp-api.js";

console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS);

async function main() {
	for (let [functionName, data] of Object.entries(crawlTargets)) {
		const { type, items } = data;
		switch (type) {
			case "all":
				await crawlAll(functionName);
				break;
			case "spaces":
				await crawlSpaces(functionName, items);
				break;
			case "pages":
				await crawlPages(functionName, items);
				break;
			default:
				break;
		}
		await uploadFolderToGCS(functionName);
	}

	for (let [functionName, vertexDataStoreId] of Object.entries(
		VERTEX_DATA_STORE_IDS
	)) {
		await refreshVertexDataStore(vertexDataStoreId, functionName);
	}
}

await main();
