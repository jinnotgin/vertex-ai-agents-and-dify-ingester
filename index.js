import "dotenv/config";
import { processAllPages } from "#lib/confluence-dataProcessing.js";
// import { uploadFolderToGCS, refreshVertexDataStore } from "./gcp-api.js";

console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS);

await processAllPages();

// if ((await initiateJiraSession()) === false) {
// 	console.error("Unable to intiate Jira session.");
// 	process.exit(1);
// }

// await processEpics();
// await uploadFolderToGCS("epics");

// await processStories(12000);
// await uploadFolderToGCS("stories");

// await processOpsTickets(12000);

// await refreshVertexDataStore();
