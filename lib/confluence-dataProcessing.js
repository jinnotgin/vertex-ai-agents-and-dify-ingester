import {
	getAllSpaces,
	getAllPagesInSpace,
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

const DELAY_TIME = 250;

async function processAllPagesAndAttachments() {
	const FUNCTION_NAME = "allPagesAndAttachments";
	const GSC_BUCKET_NAME = "ufinity-confluence-data"; // TODO: See if can shift to secrets or constants
	const METADATA_FILE_PATH = getFilePath(FUNCTION_NAME, "0metadata", "ndjson");

	const cachedPageData = {};
	try {
		clearDataDirectory(FUNCTION_NAME);

		const allSpaces = await getAllSpaces();
		logger.info(
			`processAllPagesAndAttachments: Found ${allSpaces.length} spaces.`
		);

		for (let space of allSpaces) {
			const { id: spaceId, name: spaceName, key: spaceKey } = space;

			const allPages = await getAllPagesInSpace(spaceId);
			logger.info(
				`processAllPagesAndAttachments: Found ${allPages.length} pages in Space ${spaceName}.`
			);

			for (let page of allPages) {
				const { id, title, body, webUrl, createdAt } = page;

				// store this for later reference (e.g attachments)
				cachedPageData[id] = {
					title,
					spaceName,
					spaceKey,
				};

				const filePath = getFilePath(
					FUNCTION_NAME,
					`${spaceKey} ${id}`,
					"html"
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
						mimeType: "text/html",
						uri: `gs://${GSC_BUCKET_NAME}/${FUNCTION_NAME}/${fileName}`,
					},
				};
				logger.info(
					`processAllPagesAndAttachments: Saving ${filePath} with metadata update`
				);
				saveAsText(body, filePath);
				appendAsText(`${JSON.stringify(metadata)}\n`, METADATA_FILE_PATH);
				sleep(DELAY_TIME);
			}
		}

		const allMediaTypes = Object.entries(FILE_EXTENSION_TYPE_MAP);
		for (let [fileExtension, mediaType] of allMediaTypes) {
			const allAttachments = await getAllAttachments(mediaType);
			logger.info(
				`processAllPagesAndAttachments: Found ${allAttachments.length} pages for media type ${mediaType}.`
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

				const { spaceName = "", spaceKey = "" } =
					cachedPageData?.[pageId] || {};

				const filePath = getFilePath(
					FUNCTION_NAME,
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
						uri: `gs://${GSC_BUCKET_NAME}/${FUNCTION_NAME}/${fileName}`,
					},
				};
				logger.info(
					`processAllPagesAndAttachments: Saving ${filePath} with metadata update`
				);
				await downloadAndSaveAttachment(downloadUrl, filePath);
				appendAsText(`${JSON.stringify(metadata)}\n`, METADATA_FILE_PATH);
				sleep(DELAY_TIME);
			}
		}
	} catch (error) {
		logger.error(`processAllPagesAndAttachments: Error: ${error.message}`);
	}
}

export { processAllPagesAndAttachments };
