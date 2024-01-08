import {
	getAllSpaces,
	getAllPagesInSpace,
	getPageById,
	getChildPagesOfPageId,
	getAllAttachments,
	downloadAndSaveAttachment,
} from "#lib/confluence-api.js";
import {
	getFilePath,
	saveAsText,
	appendAsText,
	clearDataDirectory,
	getFilenameFromPath,
} from "#lib/diskio.js";
import { sleep } from "#lib/utils.js";
import { FILE_EXTENSION_TYPE_MAP } from "#lib/constants.js";
import logger from "#lib/logger.js";

import { loadSecrets } from "#lib/utils.js";
const { GCS_BUCKET_NAME } = await loadSecrets();

const DELAY_TIME = 0;

async function crawlAll(functionName) {
	try {
		clearDataDirectory(functionName);

		const allSpaces = await getAllSpaces();
		logger.info(`crawlAll: Found ${allSpaces.length} spaces.`);

		await processPagesAndAttachmentsInSpaces(functionName, allSpaces);
	} catch (error) {
		logger.error(`crawlAll: Error: ${error.message}`);
	}
}

async function crawlSpaces(functionName, targetSpacesKeys = []) {
	try {
		clearDataDirectory(functionName);

		const allSpaces = await getAllSpaces();
		const targetSpaces = allSpaces.filter((x) =>
			targetSpacesKeys.includes(x.key)
		);
		logger.info(`crawlSpaces: Found ${targetSpaces.length} spaces.`);

		await processPagesAndAttachmentsInSpaces(functionName, targetSpaces);
	} catch (error) {
		logger.error(`crawlSpaces: Error: ${error.message}`);
	}
}

async function crawlPages(
	functionName,
	targetPagesId = [],
	includeChildPages = false
) {
	try {
		clearDataDirectory(functionName);

		const allSpaces = await getAllSpaces();
		const spacesDataById = {};
		allSpaces.forEach((space) => {
			const { id } = space;
			spacesDataById[id] = space;
		});

		logger.info(`crawlPages: Prepared data for ${allSpaces.length} spaces.`);

		if (includeChildPages) {
			let targetPagesSet = new Set(targetPagesId);
			for (let pageId of targetPagesSet) {
				logger.info(`Getting child pages for ${pageId}`);

				const childPages = await getChildPagesOfPageId(pageId);
				logger.info(`Child pages found:`, childPages);

				childPages.forEach((item) => targetPagesSet.add(item));
			}
			targetPagesId = Array.from(targetPagesSet);
		}

		await processPagesAndAttachments(
			functionName,
			targetPagesId,
			spacesDataById
		);
	} catch (error) {
		logger.error(`crawlPages: Error: ${error.message}`);
	}
}

async function processPagesAndAttachmentsInSpaces(functionName, spaces) {
	try {
		const metadataFilePath = getFilePath(functionName, "0metadata", "ndjson");

		const cachedPageData = {};
		for (let space of spaces) {
			const { id: spaceId, name: spaceName, key: spaceKey } = space;

			const allPages = await getAllPagesInSpace(spaceId);
			logger.info(
				`processPagesAndAttachmentsInSpaces: Found ${allPages.length} pages in Space ${spaceName}.`
			);

			for (let page of allPages) {
				const { id, title, body, webUrl, createdAt } = page;

				// store this for later reference (e.g attachments)
				cachedPageData[id] = {
					title,
					spaceName,
					spaceKey,
				};

				const filePath = getFilePath(functionName, `${spaceKey} ${id}`, "html");
				const fileName = getFilenameFromPath(filePath);

				const metadata = {
					id,
					structData: {
						title,
						spaceName,
						webUrl,
						createdAt,
					},
					content: {
						mimeType: "text/html",
						uri: `gs://${GCS_BUCKET_NAME}/${functionName}/${fileName}`,
					},
				};
				logger.info(
					`processPagesAndAttachmentsInSpaces: Saving ${filePath} with metadata update`
				);
				saveAsText(body, filePath);
				appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
				await sleep(DELAY_TIME);
			}
		}

		await processAttachments(functionName, cachedPageData, metadataFilePath);
	} catch (error) {
		logger.error(`processPagesAndAttachmentsInSpaces: Error: ${error.message}`);
	}
}

async function processPagesAndAttachments(
	functionName,
	allPagesId,
	spacesData
) {
	try {
		const metadataFilePath = getFilePath(functionName, "0metadata", "ndjson");

		const cachedPageData = {};
		for (let pageId of allPagesId) {
			const page = await getPageById(pageId);
			const { id, title, body, webUrl, createdAt, spaceId } = page;
			const { name: spaceName, key: spaceKey } = spacesData?.[spaceId];

			// store this for later reference (e.g attachments)
			cachedPageData[id] = {
				title,
				spaceName,
				spaceKey,
			};

			const filePath = getFilePath(functionName, `${spaceKey} ${id}`, "html");
			const fileName = getFilenameFromPath(filePath);

			const metadata = {
				id,
				structData: {
					title,
					spaceName,
					webUrl,
					createdAt,
				},
				content: {
					mimeType: "text/html",
					uri: `gs://${GCS_BUCKET_NAME}/${functionName}/${fileName}`,
				},
			};
			logger.info(
				`processPagesAndAttachments: Saving ${filePath} with metadata update`
			);
			saveAsText(body, filePath);
			appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
			await sleep(DELAY_TIME);
		}

		await processAttachments(functionName, cachedPageData, metadataFilePath);
	} catch (error) {
		logger.error(`processPagesAndAttachments: Error: ${error.message}`);
	}
}

async function processAttachments(
	functionName,
	cachedPageData,
	metadataFilePath
) {
	const allMediaTypes = Object.entries(FILE_EXTENSION_TYPE_MAP);
	for (let [fileExtension, mediaType] of allMediaTypes) {
		const allAttachments = await getAllAttachments(mediaType);
		logger.info(
			`processAttachments: Found ${allAttachments.length} pages for media type ${mediaType}.`
		);

		const cachedPageDataIds = Object.keys(cachedPageData);
		for (let attachment of allAttachments) {
			const {
				id,
				title,
				webUrl,
				downloadUrl,
				createdAt,
				mediaType,
				pageId,
				fileId,
			} = attachment;

			if (!cachedPageDataIds.includes(pageId)) continue;

			const { spaceName = "", spaceKey = "" } = cachedPageData?.[pageId] || {};

			const filePath = getFilePath(
				functionName,
				`${spaceKey} ${fileId}`,
				fileExtension
			);
			const fileName = getFilenameFromPath(filePath);

			const metadata = {
				id,
				structData: {
					title,
					spaceName,
					webUrl,
					createdAt,
				},
				content: {
					mimeType: mediaType,
					uri: `gs://${GCS_BUCKET_NAME}/${functionName}/${fileName}`,
				},
			};
			logger.info(
				`processAttachments: Saving ${filePath} with metadata update`
			);
			await downloadAndSaveAttachment(downloadUrl, filePath);
			appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
			await sleep(DELAY_TIME);
		}
	}
}

export { crawlAll, crawlSpaces, crawlPages };
