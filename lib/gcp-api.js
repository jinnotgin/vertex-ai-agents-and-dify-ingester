import "dotenv/config";
import { Storage } from "@google-cloud/storage";
import {
	GCS_BUCKET_NAME,
	GCP_PROJECT_ID,
	VERTEX_DATA_STORE_IDS,
} from "#secrets.js";
import { getDirectoryPath } from "#lib/utils.js";
import { GoogleAuth } from "google-auth-library";
import fs from "fs";
import path from "path";

// const storage = new Storage({ keyFilename: "path/to/your/keyfile.json" });
const storage = new Storage();
const gcsFolderPaths = {
	epics: "jira_epics",
	stories: "jira_stories",
	ops_ticets: "jira_ops_ticets",
};

export async function uploadFolderToGCS(dataFolderName) {
	try {
		const localFolderPath = getDirectoryPath(dataFolderName);
		const gcsFolderPath = gcsFolderPaths[dataFolderName];

		// Delete existing files in the GCS folder
		await gcs_deleteFiles(GCS_BUCKET_NAME, gcsFolderPath);

		// Upload new files from the local folder
		const files = fs.readdirSync(localFolderPath);
		for (const file of files) {
			const localFilePath = path.join(localFolderPath, file);
			const destination = `${gcsFolderPath}/${file}`;
			await storage
				.bucket(GCS_BUCKET_NAME)
				.upload(localFilePath, { destination });
			console.log(`${file} uploaded to ${GCS_BUCKET_NAME}/${destination}`);
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

async function gcs_deleteFiles(bucketName, prefix) {
	const [files] = await storage.bucket(bucketName).getFiles({ prefix });
	for (const file of files) {
		await file.delete();
		console.log(`Deleted file ${file.name}`);
	}
}

// --------------------------

const auth = new GoogleAuth({
	scopes: "https://www.googleapis.com/auth/cloud-platform",
});
const ACCESS_TOKEN = await auth.getAccessToken();

async function vertex_purgeDataStore(projectId, dataStoreId) {
	const location = "global"; // e.g., 'us-central1'
	const collectionId = "default_collection";
	const branchId = "0"; // e.g., '0' for the default branch

	const parentPath = `projects/${projectId}/locations/${location}/collections/${collectionId}/dataStores/${dataStoreId}/branches/${branchId}`;
	const url = `https://discoveryengine.googleapis.com/v1beta/${parentPath}/documents:purge`;

	const requestBody = {
		filter: "*",
		force: true,
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Error in response: ${error}`);
	}

	const responseData = await response.json();
	console.log("Purge initiated successfully:", responseData);
}
async function vertex_importIntoDataStore(
	projectId,
	dataStoreId,
	gcsSourceUri
) {
	const location = "global"; // e.g., 'us-central1'
	const collectionId = "default_collection";
	const branchId = "0"; // e.g., '0' for the default branch

	const parentPath = `projects/${projectId}/locations/${location}/collections/${collectionId}/dataStores/${dataStoreId}/branches/${branchId}`;
	const url = `https://discoveryengine.googleapis.com/v1beta/${parentPath}/documents:import`;

	const requestBody = {
		reconciliationMode: "FULL", // Set reconciliation mode to FULL
		gcsSource: {
			inputUris: [gcsSourceUri],
			dataSchema: "content", // https://cloud.google.com/generative-ai-app-builder/docs/reference/rest/v1beta/GcsSource
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Error in response: ${error}`);
	}

	const responseData = await response.json();
	console.log("Import initiated successfully:", responseData);
}

export async function refreshVertexDataStore() {
	// For App: Search - Jira Stories with Epics
	// vertex_purgeDataStore(
	//   GCP_PROJECT_ID,
	//   VERTEX_DATA_STORE_IDS.SEARCH_JIRA_STORIES_EPICS
	// );
	// vertex_importIntoDataStore(
	//   GCP_PROJECT_ID,
	//   VERTEX_DATA_STORE_IDS.SEARCH_JIRA_STORIES_EPICS,
	//   `gs://${GCS_BUCKET_NAME}/${gcsFolderPaths.epics}/*`
	// );
	// vertex_importIntoDataStore(
	//   GCP_PROJECT_ID,
	//   VERTEX_DATA_STORE_IDS.SEARCH_JIRA_STORIES_EPICS,
	//   `gs://${GCS_BUCKET_NAME}/${gcsFolderPaths.stories}/*`
	// );
	// -------
	// For App: Search - Jira Ops
	// -------
	// For App: Search - Jira Stories
	// (Disabled for now, as import job will conflict)
	// vertex_purgeDataStore(
	//   GCP_PROJECT_ID,
	//   VERTEX_DATA_STORE_IDS.SEARCH_JIRA_STORIES
	// );
	// vertex_importIntoDataStore(
	//   GCP_PROJECT_ID,
	//   VERTEX_DATA_STORE_IDS.SEARCH_JIRA_STORIES,
	//   `gs://${GCS_BUCKET_NAME}/${gcsFolderPaths.stories}/*`
	// );
}
