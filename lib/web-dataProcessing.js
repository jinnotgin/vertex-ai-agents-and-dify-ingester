import { URL } from 'url';
import { createHash } from 'crypto';
import { JSDOM } from 'jsdom';
import { loadSecrets, retryAsyncFunction, sleep } from '#lib/utils.js';
import logger from '#lib/logger.js';
import { appendAsText, getFilePath, saveAsText, getFilenameFromPath } from '#lib/diskio.js';

const { GCS_BUCKET_NAME } = await loadSecrets();
const RETRY_ASYNC_FUNCTION_SETTINGS = {}; // keep as default settings
const BASE_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36)',
};
const SOURCE_PREFIX = "web";

const scrapedUrls = new Set();

async function getRequest(url, headers = {}) {
	try {
		logger.info('getRequest: Fetching', { url });
		const response = await fetch(url, {
			method: 'GET',
			headers: { ...BASE_HEADERS, ...headers },
		});

		if (response.ok) {
			const data = await response.text();
			logger.info('getRequest: Successfully fetched.');
			return data;
		} else {
			logger.error(`getRequest: HTTP Error: ${response.status}`);
			throw new Error(`HTTP Error: ${response.status}`);
		}
	} catch (error) {
		logger.error(`Error in URL GET request: ${error.message}`);
		throw error;
	}
}

function generateId(url) {
	return createHash('md5').update(url).digest('hex');
	// return createHash('md5').update(url).digest('hex').slice(0, 8); // Use MD5 and truncate to 8 characters
}

function extractTitle(htmlContent) {
	const dom = new JSDOM(htmlContent);
	const title = dom.window.document.querySelector('title');
	return title ? title.textContent : 'No title';
}

function extractLinks(htmlContent, baseUrl, regex, bannedUrlPatterns) {
	const dom = new JSDOM(htmlContent);
	const links = Array.from(dom.window.document.querySelectorAll('a[href]'))
		.map(a => new URL(a.href, baseUrl).href)
		.filter(href => regex.test(href))
		.filter(href => !bannedUrlPatterns.some(pattern => pattern.test(href)));
	return links;
}

async function _crawlUrl(crawlTargetName, url, includeLinks = true, regex, bannedUrlPatterns = [], bannedTitlePatterns = [], depth = 1, headers = {}) {
	if (depth <= 0) return [];

	const normalizedUrl = new URL(url).origin + new URL(url).pathname;
	if (scrapedUrls.has(normalizedUrl)) {
		logger.info(`Skipping already scraped URL: ${normalizedUrl}`);
		return [];
	}

	// Check if the URL matches any of the banned patterns
	if (bannedUrlPatterns.some(pattern => pattern.test(normalizedUrl))) {
		logger.info(`Skipping banned URL: ${normalizedUrl}`);
		return [];
	}

	scrapedUrls.add(normalizedUrl);

	const pageContent = await getRequest(url, headers);

	const id = generateId(normalizedUrl);
	const title = extractTitle(pageContent);

	// Check if the title matches any of the banned patterns
	if (bannedTitlePatterns.some(pattern => pattern.test(title))) {
		logger.info(`Skipping page with banned title: ${title}`);
		return [];
	}

	// Save page content to a file
	const filePath = getFilePath(crawlTargetName, `${SOURCE_PREFIX} ${id} ${title}`, 'html');
	const fileName = getFilenameFromPath(filePath);
	logger.info(`crawlUrl: Saving ${filePath} with metadata update`);
	saveAsText(pageContent, filePath);
	saveMetadata(crawlTargetName, id, title, url, new Date().toISOString(), 'text/html', fileName);

	// Extract links using JSDOM
	const links = extractLinks(pageContent, url, regex, bannedUrlPatterns);
	logger.info(`Found ${links.length} links on ${url}`);

	const nestedResults = [];
	if (includeLinks && links.length > 0) {
		for (const link of links) {
			const nestedResult = await _crawlUrl(crawlTargetName, new URL(link, url).href, includeLinks, regex, bannedUrlPatterns, bannedTitlePatterns, depth - 1, headers);
			nestedResults.push(...nestedResult);
		}
	}

	return [url, ...nestedResults];
}

async function crawlUrl(crawlTargetName, url, includeLinks = true, regex, bannedUrlPatterns = [], bannedTitlePatterns = [], depth = 1, headers = {}) {
	return await retryAsyncFunction(_crawlUrl, RETRY_ASYNC_FUNCTION_SETTINGS, crawlTargetName, url, includeLinks, regex, bannedUrlPatterns, bannedTitlePatterns, depth, headers);
}

function saveMetadata(crawlTargetName, id, title, webUrl, createdAt, mimeType, fileName, customData = {}) {
	const metadata = {
		id,
		structData: {
			title,
			webUrl,
			createdAt,
			...customData,
		},
		content: {
			mimeType,
			uri: `gs://${GCS_BUCKET_NAME}/${crawlTargetName}/${fileName}`,
		},
	};

	const metadataFilePath = getFilePath(crawlTargetName, '0metadata', 'ndjson');
	appendAsText(`${JSON.stringify(metadata)}\n`, metadataFilePath);
}

export { crawlUrl };

// Example usage:
// await crawlUrl('https://example.com', true, /https:\/\/example.com\/path\/\S+/g, 2);
