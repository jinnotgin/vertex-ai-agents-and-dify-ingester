import fs from "fs";
import path from "path";
import logger from "#lib/logger.js";
import { removeRepeatedSpaces } from "#lib/utils.js";

function ensureDirectoryExists(directory) {
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

function ensureFilePathDirectoryExists(filePath) {
	const directory = path.dirname(filePath);
	ensureDirectoryExists(directory);
}

function saveAs(data, filePath) {
	ensureFilePathDirectoryExists(filePath);
	fs.writeFileSync(filePath, data);
	logger.info(`Wrote data to ${filePath}`);
}

function saveAsText(textData, filePath) {
	ensureFilePathDirectoryExists(filePath);
	fs.writeFileSync(filePath, textData, { encoding: "utf-8" });
	logger.info(`Wrote data to ${filePath}`);
}

function appendAsText(textData, filePath) {
	ensureFilePathDirectoryExists(filePath);
	try {
		fs.appendFileSync(filePath, textData, { encoding: "utf-8" });
		logger.info(`Appended data to ${filePath}`);
	} catch (err) {
		logger.error(`Error appending data to ${filePath}: ${err}`);
	}
}

function sanitizeFilename(filename) {
	// Remove invalid filename characters (e.g., <, >, :, ", /, \, |, ?, *, and control characters)
	let sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ");

	// Replace periods or spaces at the beginning of the filename with a single space
	// The regex '^(?:\.*|\s*)' matches any number of periods or spaces at the start of the string
	sanitized = sanitized.replace(/^(?:\.*|\s*)/, " ");

	// Remove periods or spaces at the end of the filename
	// The regex '(?:\.*|\s*)$' matches any number of periods or spaces at the end of the string
	sanitized = sanitized.replace(/(?:\.*|\s*)$/, " ");

	// Remove repeated spacing (reduces sequences of spaces or \xa0 to a single space)
	sanitized = removeRepeatedSpaces(sanitized);

	// Trim leading and trailing whitespace
	return sanitized.trim();
}

function truncateFullFilename(fullFilename) {
	const MAX_FILENAME_LENGTH = 255;

	if (fullFilename.length <= MAX_FILENAME_LENGTH) {
		return fullFilename;
	}

	const extension = fullFilename.split(".").pop(); // Get the file extension
	const truncatedLength = MAX_FILENAME_LENGTH - (extension.length + 1); // Account for the dot in the extension

	const truncatedBaseName = fullFilename.substring(0, truncatedLength);
	return `${truncatedBaseName}.${extension}`;
}

function getFilePath(folderName, fileName, fileExtension) {
	const FILENAME_HAS_FOLDERS = fileName.includes("/");
	let moreFolders = [];
	if (FILENAME_HAS_FOLDERS) {
		moreFolders = fileName.split("/");
		fileName = moreFolders.pop();
	}

	fileName = sanitizeFilename(fileName);

	let fullFilename = `${fileName}.${fileExtension}`;
	fullFilename = truncateFullFilename(fullFilename);

	const currentWorkingDirectory = process.cwd();
	return path.join(
		currentWorkingDirectory,
		"data",
		folderName,
		...moreFolders,
		fullFilename
	);
}

function getDirectoryPath(folderName) {
	const currentWorkingDirectory = process.cwd();
	const directoryPath = path.join(currentWorkingDirectory, "data", folderName);

	return directoryPath;
}

function getFilenameFromPath(fullPath) {
	return path.basename(fullPath);
}

function clearDirectory(dirPath) {
	if (fs.existsSync(dirPath)) {
		fs.readdirSync(dirPath).forEach((file) => {
			const curPath = path.join(dirPath, file);

			if (fs.lstatSync(curPath).isDirectory()) {
				// recurse
				clearDirectory(curPath);
			} else {
				// delete file
				fs.unlinkSync(curPath);
			}
		});

		// Optionally, remove the directory itself if you want it to be completely cleared
		fs.rmdirSync(dirPath);
	}
}

function clearDataDirectory() {
	const dirPath = getDirectoryPath("");
	clearDirectory(dirPath);
}

export {
	saveAs,
	saveAsText,
	appendAsText,
	sanitizeFilename,
	getFilePath,
	getDirectoryPath,
	clearDataDirectory,
	getFilenameFromPath,
};
