import { readFile, unlink } from 'fs/promises';
import logger from "#lib/logger.js";
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { parse } from 'ndjson';
import {
	getFilePath,
	getFilenameFromPath,
} from "#lib/diskio.js";

/**
 * Reads a .ndjson file and writes its contents to a SQLite database file.
 * @param {string} inputFilePath - Path to the input .ndjson file.
 * @param {string} outputDbFilePath - Path to the output SQLite database file.
 */
async function ndjsonToSqlite(inputFilePath, outputDbFilePath) {
  try {
    // Delete the existing database file if it exists
    try {
      await unlink(outputDbFilePath);
      logger.info(`Deleted existing database file: ${outputDbFilePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File does not exist, which is fine
    }

    // Read the .ndjson file
    const fileContent = await readFile(inputFilePath, 'utf-8');

    // Open SQLite database
    const db = await open({
      filename: outputDbFilePath,
      driver: sqlite3.Database,
    });

    // Create table in the SQLite database
    await db.exec(
      `CREATE TABLE IF NOT EXISTS data (
        filename TEXT PRIMARY KEY,
        id TEXT,
        title TEXT,
        webUrl TEXT,
        createdAt TEXT,
        mimeType TEXT,
        uri TEXT
      )`
    );

    // Parse and insert data from .ndjson
    const parser = parse();
    parser.on('data', async (obj) => {
      const { id, structData, content } = obj;
      const filename = content.uri.split('/').pop();

      await db.run(
        `INSERT OR REPLACE INTO data (filename, id, title, webUrl, createdAt, mimeType, uri)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        filename,
        id,
        structData.title,
        structData.webUrl,
        structData.createdAt,
        content.mimeType,
        content.uri
      );
    });

    parser.write(fileContent);
    parser.end();

    // Close the database connection
    await db.close();
  } catch (error) {
    logger.error(`Error: ${error}`);
  }
}

/**
 * Reads a crawlTarget's .ndjson file and writes its contents to a SQLite database file.
 * @param {string} crawlTargetName - Name of the crawlTargetName.
 */
export async function convertMetadataToSqlite(crawlTargetName) {
	const metadataFilePath = getFilePath(crawlTargetName, "0metadata", "ndjson");
	const metadataSqlitePath = getFilePath(crawlTargetName, "0metadata", "sqlite");
	return await ndjsonToSqlite(metadataFilePath, metadataSqlitePath)
}

// Usage
// const inputFilePath = '/Users/jin/Documents/GitHub/confluence-cloud-scraper/data/betaSLSGuru/0metadata.ndjson'; // Path to your .ndjson file
// const outputDbFilePath = '/Users/jin/Documents/GitHub/confluence-cloud-scraper/data/betaSLSGuru/0metadata.sqlite'; // Path to your SQLite database file
// ndjsonToSqlite(inputFilePath, outputDbFilePath);
