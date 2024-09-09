import {
	getAllSpaces,
	getAllPagesInSpace,
	getPageById,
	getChildPagesOfPageId,
	getAllAttachments,
	getAllAttachmentsForPage,
	downloadAndSaveAttachment,
} from "#lib/confluence-api.js";
import {
	getFilePath,
	saveAsText,
	appendAsText,
	getFilenameFromPath,
} from "#lib/diskio.js";
import { sleep } from "#lib/utils.js";
import { VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP } from "#lib/constants.js";
import logger from "#lib/logger.js";

import { loadSecrets } from "#lib/utils.js";
const { GCS_BUCKET_NAME } = await loadSecrets();

const SOURCE_PREFIX = "confluence-cloud";
const DELAY_TIME = 0;

function saveMetadata(
	functionName,
	id,
	title,
	spaceName,
	webUrl,
	createdAt,
	mimeType,
	fileName
) {
	const metadata = {
		id,
		structData: {
			title,
			spaceName,
			webUrl,
			createdAt,
		},
		content: {
			mimeType,
			uri: `gs://${GCS_BUCKET_NAME}/${functionName}/${fileName}`,
		},
	};

	const metadataFilePath = getFilePath(functionName, "0metadata", "ndjson");
	appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
}

function shouldProcessFile(filename, bannedAttachmentPatterns) {
  return !bannedAttachmentPatterns.some(pattern => pattern.test(filename));
}

function extractAttachmentFilenames(body) {
  const regex = /<ri:attachment ri:filename="([^"]+)"/g;
  const filenames = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    filenames.push(match[1]);
  }
  return filenames;
}

async function processPageAndItsAttachments(functionName, page, spaceName, spaceKey, bannedAttachmentPatterns) {
  const { id, title, body, webUrl, createdAt } = page;

  const filePath = getFilePath(
    functionName,
    `${SOURCE_PREFIX} ${spaceKey} ${id}`,
    "html"
  );
  const fileName = getFilenameFromPath(filePath);

  logger.info(
    `processPageAndItsAttachments: Saving ${filePath} with metadata update`
  );
  saveAsText(`${title}\n\n${body}`, filePath);
  saveMetadata(
    functionName,
    id,
    title,
    spaceName,
    webUrl,
    createdAt,
    "text/html",
    fileName
  );

  const attachmentFilenames = extractAttachmentFilenames(body);
  const allAttachments = await getAllAttachmentsForPage(id);
  
  for (let attachment of allAttachments) {
    if (attachmentFilenames.includes(attachment.title)) {
      await processAttachment(functionName, attachment, spaceName, spaceKey, bannedAttachmentPatterns);
    }
  }

  await sleep(DELAY_TIME);
}

async function processAttachment(functionName, attachment, spaceName, spaceKey, bannedAttachmentPatterns) {
  const { id, title, webUrl, downloadUrl, createdAt, mediaType, fileId } = attachment;

	if (!shouldProcessFile(title, bannedAttachmentPatterns)) {
    logger.info(`Skipping banned file: ${title}`);
    return;
  }

  const fileExtension = Object.keys(VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP)
    .find(ext => VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP[ext] === mediaType);

  if (!fileExtension) {
    logger.info(`Skipping attachment with unsupported media type: ${mediaType}`);
    return;
  }

  const filePath = getFilePath(
    functionName,
    `${SOURCE_PREFIX} ${spaceKey} ${fileId}`,
    fileExtension
  );
  const fileName = getFilenameFromPath(filePath);

  logger.info(
    `processAttachment: Saving ${filePath} with metadata update`
  );
  await downloadAndSaveAttachment(downloadUrl, filePath);
  saveMetadata(
    functionName,
    id,
    title,
    spaceName,
    webUrl,
    createdAt,
    mediaType,
    fileName
  );
}

async function processAllPagesAndAttachmentsInSpaces(functionName, spaces, bannedAttachmentPatterns) {
	try {
		const cachedPageData = {};
		for (let space of spaces) {
			const { id: spaceId, name: spaceName, key: spaceKey } = space;

			const allPages = await getAllPagesInSpace(spaceId);
			logger.info(
				`processAllPagesAndAttachmentsInSpaces: Found ${allPages.length} pages in Space ${spaceName}.`
			);

			/*
			for (let page of allPages) {
				const { id, title, body, webUrl, createdAt } = page;

				// store this for later reference (e.g attachments)
				cachedPageData[id] = {
					title,
					spaceName,
					spaceKey,
				};

				const filePath = getFilePath(
					functionName,
					`${SOURCE_PREFIX} ${spaceKey} ${id}`,
					"html"
				);
				const fileName = getFilenameFromPath(filePath);

				logger.info(
					`processAllPagesAndAttachmentsInSpaces: Saving ${filePath} with metadata update`
				);
				saveAsText(`${title}\n\n${body}`, filePath);
				saveMetadata(
					functionName,
					id,
					title,
					spaceName,
					webUrl,
					createdAt,
					"text/html",
					fileName
				);
				await sleep(DELAY_TIME);
			}
			*/

			for (let page of allPages) {
				await processPageAndItsAttachments(functionName, page, spaceName, spaceKey, bannedAttachmentPatterns);
			}

		}

		// we use this function (instead of _processAttachmentsInPages), because the nature of this function
		// sweeps across multiple spaces. Using this function will reduce the amount of API calls, by
		// returning all attachments across all spaces
		/*
		await _processAttachmentsAcrossAllSpaces(functionName, cachedPageData);
		*/
	} catch (error) {
		logger.error(
			`processAllPagesAndAttachmentsInSpaces: Error: ${error.message}`
		);
	}
}

/*
async function _processAttachmentsAcrossAllSpaces(
	functionName,
	cachedPageData
) {
	const allMediaTypes = Object.entries(VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP);
	for (let [fileExtension, mediaType] of allMediaTypes) {
		const allAttachments = await getAllAttachments(mediaType);
		logger.info(
			`_processAttachmentsAcrossAllSpaces: Found ${allAttachments.length} attachments for media type ${mediaType}.`
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
				`${SOURCE_PREFIX} ${spaceKey} ${fileId}`,
				fileExtension
			);
			const fileName = getFilenameFromPath(filePath);

			logger.info(
				`_processAttachmentsAcrossAllSpaces: Saving ${filePath} with metadata update`
			);
			await downloadAndSaveAttachment(downloadUrl, filePath);
			saveMetadata(
				functionName,
				id,
				title,
				spaceName,
				webUrl,
				createdAt,
				mediaType,
				fileName
			);
			await sleep(DELAY_TIME);
		}
	}
}
*/

/*
async function processSpecificPagesAndItsAttachments(
	functionName,
	allPagesId,
	spacesData
) {
	try {
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

			const filePath = getFilePath(
				functionName,
				`${SOURCE_PREFIX} ${spaceKey} ${id}`,
				"html"
			);
			const fileName = getFilenameFromPath(filePath);

			logger.info(
				`processSpecificPagesAndItsAttachments: Saving ${filePath} with metadata update`
			);
			saveAsText(`${title}\n\n${body}`, filePath);
			saveMetadata(
				functionName,
				id,
				title,
				spaceName,
				webUrl,
				createdAt,
				"text/html",
				fileName
			);
			await sleep(DELAY_TIME);
		}

		await _processAttachmentsInPages(functionName, cachedPageData);
	} catch (error) {
		logger.error(
			`processSpecificPagesAndItsAttachments: Error: ${error.message}`
		);
	}
}
*/

/*
async function _processAttachmentsInPages(functionName, cachedPageData) {
	const allAcceptedFileExtensions = Object.keys(
		VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP
	);
	const allAcceptedMimeTypes = Object.values(VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP);

	const cachedPageDataIds = Object.keys(cachedPageData);
	for (let pageId of cachedPageDataIds) {
		const allAttachments = await getAllAttachmentsForPage(pageId);
		logger.info(
			`_processAttachmentsInPages: Found ${allAttachments.length} attachments for page ${pageId}.`
		);

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

			if (!allAcceptedMimeTypes.includes(mediaType)) continue;

			const fileExtension =
				allAcceptedFileExtensions[allAcceptedMimeTypes.indexOf(mediaType)];

			const { spaceName = "", spaceKey = "" } = cachedPageData?.[pageId] || {};

			const filePath = getFilePath(
				functionName,
				`${SOURCE_PREFIX} ${spaceKey} ${fileId}`,
				fileExtension
			);
			const fileName = getFilenameFromPath(filePath);

			logger.info(
				`_processAttachmentsInPages: Saving ${filePath} with metadata update`
			);
			await downloadAndSaveAttachment(downloadUrl, filePath);
			saveMetadata(
				functionName,
				id,
				title,
				spaceName,
				webUrl,
				createdAt,
				mediaType,
				fileName
			);
			await sleep(DELAY_TIME);
		}
	}
}
*/

async function crawlAll(functionName, bannedAttachmentPatterns) {
	try {
		const allSpaces = await getAllSpaces();
		logger.info(`crawlAll: Found ${allSpaces.length} spaces.`);

		await processAllPagesAndAttachmentsInSpaces(functionName, allSpaces, bannedAttachmentPatterns);
	} catch (error) {
		logger.error(`crawlAll: Error: ${error.message}`);
	}
}

async function crawlSpaces(functionName, targetSpacesKeys = [], bannedAttachmentPatterns) {
	try {
		const allSpaces = await getAllSpaces();
		const targetSpaces = allSpaces.filter((x) =>
			targetSpacesKeys.includes(x.key)
		);
		logger.info(`crawlSpaces: Found ${targetSpaces.length} spaces.`);

		await processAllPagesAndAttachmentsInSpaces(functionName, targetSpaces, bannedAttachmentPatterns);
	} catch (error) {
		logger.error(`crawlSpaces: Error: ${error.message}`);
	}
}

async function crawlPages(
	functionName,
	targetPagesId = [],
	includeChildPages = false,
	excludePages = [],
	bannedAttachmentPatterns
) {
	try {
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

		if (excludePages.length > 0) {
			targetPagesId = targetPagesId.filter(
				(pageId) => excludePages.includes(pageId) === false
			);
		}

		/*
		await processSpecificPagesAndItsAttachments(
			functionName,
			targetPagesId,
			spacesDataById
		);
		*/

    for (let pageId of targetPagesId) {
      const page = await getPageById(pageId);
      const { spaceId } = page;
      const { name: spaceName, key: spaceKey } = spacesDataById[spaceId];
      await processPageAndItsAttachments(functionName, page, spaceName, spaceKey, bannedAttachmentPatterns);
    }
	} catch (error) {
		logger.error(`crawlPages: Error: ${error.message}`);
	}
}

export { crawlAll, crawlSpaces, crawlPages };
