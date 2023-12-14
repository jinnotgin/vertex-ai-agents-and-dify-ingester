import { getAllSpaces, getAllPagesInSpace } from "#lib/confluence-api.js";
import { getFilePath, saveAsText, clearDataDirectory } from "#lib/diskio.js";
import logger from "#lib/logger.js";

async function processAllPages() {
	try {
		clearDataDirectory("allPages");

		const allSpaces = await getAllSpaces();
		logger.info(`processAllPages: Found ${allSpaces.length} spaces.`);

		for (let space of allSpaces) {
			const { id: spaceId, name: spaceName } = space;

			const allPages = await getAllPagesInSpace(spaceId);
			logger.info(
				`processAllPages: Found ${allPages.length} pages in Space ${spaceName}.`
			);

			for (let page of allPages) {
				const { title, body, url } = page;

				const filePath = getFilePath("allPages", url, "txt");
				const fileContent = `Space: ${spaceName}
Title: ${title}

${body}`;
				logger.info(`processAllPages: Saving ${filePath}`);
				saveAsText(fileContent, filePath);
			}
		}
	} catch (error) {
		logger.error(`processAllPages: Error: ${error.message}`);
	}
}

export { processAllPages };
