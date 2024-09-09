import fs from "fs";
import path from "path";
import FormData from "form-data";
import logger from "#lib/logger.js";
import { getFilePath, getDirectoryPath } from "#lib/diskio.js";
import { loadSecrets, retryAsyncFunction, RateLimiter } from "#lib/utils.js";
import { DIFY_RATE_LIMIT_PER_MINUTE } from "#lib/constants.js"

import axios from "axios";

const { DIFY_API_KEY, DIFY_BASE_URL } = await loadSecrets();
const RETRY_ASYNC_FUNCTION_SETTINGS = {}; // keep as default settings

// Initialize a rate limiter instance with a limit of x requests per minute (or any desired limit)
const difyUploadFile_rateLimiter = new RateLimiter(DIFY_RATE_LIMIT_PER_MINUTE);

async function _difyUploadFile(
	datasetId,
	filePath,
	title,
	processRule = { mode: "automatic" }
) {
	await difyUploadFile_rateLimiter.delay();
	logger.info(`_difyUploadFile: Upload ${title} to ${datasetId}`);

	const fileStream = fs.createReadStream(filePath);
	fileStream.on('error', (err) => {
			logger.error(`Error reading file: ${err.message}`);
			throw err;
	});

	const formData = new FormData();
	formData.append("file", fileStream);
	formData.append(
		"data",
		JSON.stringify({
			name: title,
			indexing_technique: "high_quality",
			process_rule: processRule,
		}),
		{ contentType: "text/plain" }
	);

	const url = `${DIFY_BASE_URL}/datasets/${datasetId}/document/create_by_file`;

	try {
		// const response = await fetch(url, {
		// 	method: "POST",
		// 	headers: {
		// 		Authorization: `Bearer ${DIFY_API_KEY}`,
		// 		...formData.getHeaders(),
		// 	},
		// 	body: formData,
		// });

		// if (!response.ok) {
		// 	const error = await response.text();
		// 	throw new Error(`Error in response: ${error}`);
		// }

		const response = await axios.post(
			`${DIFY_BASE_URL}/datasets/${datasetId}/document/create_by_file`,
			formData,
			{
				headers: {
					Authorization: `Bearer ${DIFY_API_KEY}`,
					...formData.getHeaders(),
				},
			}
		);

		if (response.status < 200 || response.status >= 300) {
			const error = new Error(`Error in response: ${response.statusText}`);
			error.response = response;
			throw error;
		}

		// const responseData = await response.json();
		const responseData = response.data;
		logger.info("File uploaded successfully:", responseData);

		// return responseData.data; // return document data including document ID
		return responseData; // return document data including document ID
	} catch (error) {
		logger.error(`Error: ${error}`);
		throw error;
	}
}

async function difyUploadFile(datasetId, filePath, title, processRule) {
	try {
		return await retryAsyncFunction(
			() => _difyUploadFile(datasetId, filePath, title, processRule),
			RETRY_ASYNC_FUNCTION_SETTINGS
		);
	} catch (error) {
		throw error;
	}
}

async function _difyPurgeDataStore(datasetId) {
	const url = `${DIFY_BASE_URL}/datasets/${datasetId}/documents`;
	const limit = 100; // Set the maximum limit of items per page
	let page = 1;
	let documents = [];

	// Fetch all documents with pagination
	while (true) {
		const response = await fetch(`${url}?page=${page}&limit=${limit}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${DIFY_API_KEY}`,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Error in response: ${error}`);
		}

		const responseData = await response.json();
		documents = documents.concat(responseData.data);

		if (!responseData.has_more) {
			break;
		}

		page++;
	}

	// Proceed with deletion of all documents
	for (const document of documents) {
		const deleteUrl = `${DIFY_BASE_URL}/datasets/${datasetId}/documents/${document.id}`;
		const deleteResponse = await fetch(deleteUrl, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${DIFY_API_KEY}`,
				"Content-Type": "application/json",
			},
		});

		if (!deleteResponse.ok) {
			const deleteError = await deleteResponse.text();
			throw new Error(`Error deleting document: ${deleteError}`);
		}
		logger.info(`Deleted document ${document.id} from ${datasetId}`);
        
		// Add a 0.3 second delay after each document deletion  
		// TODO: make this configurable
		await new Promise(resolve => setTimeout(resolve, 300));
	}
}

async function difyPurgeDataStore(datasetId) {
	return await retryAsyncFunction(
		() => _difyPurgeDataStore(datasetId),
		RETRY_ASYNC_FUNCTION_SETTINGS
	);
}

// async function _difyUpdateDocumentTitle(datasetId, documentId, newTitle) {
// 	const url = `${DIFY_BASE_URL}/datasets/${datasetId}/documents/${documentId}/update_by_text`;

// 	const data = JSON.stringify({
//     name: newTitle
// });

// 	try {
// 		const response = await fetch(url, {
// 			method: "POST",
// 			headers: {
// 					Authorization: `Bearer ${DIFY_API_KEY}`,
// 					'Content-Type': 'application/json',
// 			},
// 			body: data,
// 	});

// 	if (!response.ok) {
// 			const errorText = await response.text();
// 			let errorMessage = `Error in response: ${response.status} ${response.statusText}`;
// 			if (errorText) {
// 				errorMessage += ` - ${errorText}`;
// 			}
// 			throw new Error(errorMessage);
// 	}

// 		const responseData = await response.json();
// 		logger.info("Title updated successfully:", responseData);
// 	} catch (error) {
// 		logger.error("Error occurred while updating document title:", {
// 			message: error.message,
// 			stack: error.stack,
// 			datasetId: datasetId,
// 			documentId: documentId,
// 			newTitle: newTitle
// 		});
// 	}
// }

// async function difyUpdateDocumentTitle(datasetId, documentId, newTitle) {
// 	return await retryAsyncFunction(
// 		() => _difyUpdateDocumentTitle(datasetId, documentId, newTitle),
// 		RETRY_ASYNC_FUNCTION_SETTINGS
// 	);
// }

async function uploadFolderToDify(datasetId, dataFolderName) {
	try {
		// const localFolderPath = path.resolve(dataFolderName);
		// const metadataFilePath = path.join('data', localFolderPath, "0metadata.ndjson");
		const metadataFilePath = getFilePath(dataFolderName, "0metadata", "ndjson");

		// Purge existing files in the Dify data store
		// NOTE: This comment is made manual
		// await difyPurgeDataStore(datasetId);

		// Read and parse the 0metadata.ndjson file
		const metadataContent = fs.readFileSync(metadataFilePath, "utf8");
		const metadataLines = metadataContent.trim().split("\n");

		// Upload new files based on metadata
		for (const line of metadataLines) {
			const metadata = JSON.parse(line);
			const { id, structData } = metadata;
			const { title } = structData;
			logger.info(`uploadFolderToDify - Preparing to upload ${title}`);
			const fileName = path.basename(metadata.content.uri);
			const localFilePath = path.join(
				getDirectoryPath(dataFolderName),
				fileName
			);

			// Upload the HTML file
			// const processRules = {
			// 	mode: "automatic",
			// 	rules: {
			// 		pre_processing_rules: [
			// 			{ id: "remove_extra_spaces", enabled: true },
			// 			{ id: "remove_urls_emails", enabled: true },
			// 		],
			// 		segmentation: {
			// 			separator: "###",
			// 			max_tokens: 500,
			// 		},
			// 	},
			// };
			try {
				const uploadedFileData = await difyUploadFile(
					datasetId,
					localFilePath,
					title
					// processRules
				);
			} catch (error) {
				logger.error(`uploadFolderToDify - Error: ${error}`);
			}

			// Update the title of the uploaded document
			// const documentId = uploadedFileData.document.id;
			// await difyUpdateDocumentTitle(datasetId, documentId, title);
		}
	} catch (error) {
		logger.error(`Error: ${error}`);
	}
}

export {
	difyUploadFile,
	// difyUpdateDocumentTitle,
	difyPurgeDataStore,
	uploadFolderToDify,
};
