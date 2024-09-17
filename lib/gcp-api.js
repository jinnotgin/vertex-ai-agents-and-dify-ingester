import "dotenv/config";
import { Storage } from "@google-cloud/storage";
import { getDirectoryPath } from "#lib/diskio.js";
import { GoogleAuth } from "google-auth-library";
import logger from "#lib/logger.js";
import fs from "fs";
import path from "path";

import { loadSecrets, sleep } from "#lib/utils.js";
const { GCS_BUCKET_NAME, GCP_PROJECT_ID } = await loadSecrets();

// const storage = new Storage({ keyFilename: "path/to/your/keyfile.json" });
const storage = new Storage();

async function gcs_deleteFiles(prefix) {
	const [files] = await storage.bucket(GCS_BUCKET_NAME).getFiles({ prefix });
	for (const file of files) {
		await file.delete();
		logger.info(`Deleted file ${file.name}`);
	}
}

async function uploadFolderToGCS(dataFolderName) {
	try {
		const localFolderPath = getDirectoryPath(dataFolderName);
		const gcsFolderPath = dataFolderName;

		// Delete existing files in the GCS folder
		await gcs_deleteFiles(gcsFolderPath);

		// Upload new files from the local folder
		const files = fs.readdirSync(localFolderPath);
		for (const file of files) {
			const localFilePath = path.join(localFolderPath, file);
			const destination = `${gcsFolderPath}/${file}`;
			await storage
				.bucket(GCS_BUCKET_NAME)
				.upload(localFilePath, { destination });
			logger.info(`${file} uploaded to ${GCS_BUCKET_NAME}/${destination}`);
		}
	} catch (error) {
		logger.error("Error:", error);
	}
}

// --------------------------

const auth = new GoogleAuth({
	scopes: "https://www.googleapis.com/auth/cloud-platform",
});
const ACCESS_TOKEN = await auth.getAccessToken();

async function vertex_purgeDataStore(dataStoreId) {
	const location = "global"; // e.g., 'us-central1'
	const collectionId = "default_collection";
	const branchId = "0"; // e.g., '0' for the default branch

	const parentPath = `projects/${GCP_PROJECT_ID}/locations/${location}/collections/${collectionId}/dataStores/${dataStoreId}/branches/${branchId}`;
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
	logger.info("Purge initiated successfully:", responseData);
}
async function vertex_importIntoDataStore(dataStoreId, gcsSourceUri) {
	const location = "global"; // e.g., 'us-central1'
	const collectionId = "default_collection";
	const branchId = "0"; // e.g., '0' for the default branch

	const parentPath = `projects/${GCP_PROJECT_ID}/locations/${location}/collections/${collectionId}/dataStores/${dataStoreId}/branches/${branchId}`;
	const url = `https://discoveryengine.googleapis.com/v1beta/${parentPath}/documents:import`;

	const requestBody = {
		reconciliationMode: "FULL", // Set reconciliation mode to FULL
		gcsSource: {
			inputUris: [gcsSourceUri],
			dataSchema: "document", // https://cloud.google.com/generative-ai-app-builder/docs/reference/rest/v1beta/GcsSource
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
	logger.info("Import initiated successfully:", responseData);
}

async function refreshVertexDataStore(dataStoreId, dataFolderName) {
	try {
		await vertex_purgeDataStore(dataStoreId);

		await sleep(5000);

		const gcsSourceUri = `gs://${GCS_BUCKET_NAME}/${dataFolderName}/0metadata.ndjson`;
		await vertex_importIntoDataStore(dataStoreId, gcsSourceUri);
	} catch (error) {
		logger.error("Error:", error);
	}
}

export { uploadFolderToGCS, refreshVertexDataStore };
