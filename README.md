
# google-vertex-ai-search-ingester
 
This helps to sync / ingest documents from [Confluence Cloud](https://support.atlassian.com/confluence-cloud/docs/what-is-confluence-cloud/), [Jira Cloud](https://www.atlassian.com/software/jira/guides/getting-started/introduction#what-is-jira-software) & [Zephyr Squad](https://smartbear.com/test-management/zephyr-squad/) to [Google Vertex AI Search and Conversation](https://cloud.google.com/vertex-ai-search-and-conversation?hl=en).  

Vertex AI Search is a Retrieval Augment Generation (RAG) solution from Google Cloud Platform, which enables:
-  semantic search of unstructured data, and
- a generative answer snippet (like a chatbot) via the use of Large Language Models (LLM).

For more information on what is RAG and its association with Generative AI, refer to this video here: https://www.youtube.com/watch?v=klTvEwg3oJ4

Using this script, you can automate the process of "syncing" the RAG search, by:
1. Crawling through Confluence for pages & attachments.
2. Uploading the information & metadata to a Google Cloud Storage.
3. Triggering a refresh (purge + import) of the Vertex Data Store

# Getting Started
1. Obtain service account credentials for Google Cloud Platform.
2. Make sure you create your own `.env` and a `secrets.js` config files in the root directory. You can refer to the example files provided for a reference.
3. Set up `config.js` to define the areas you want to crawl. (More info on this later)
4. Do a `npm install` to get all the dependencies.
5. To run the script, execute a `node start.js` on the root directory.

## Getting Started, but in Google Cloud Functions

If you are intending to implement this inside Google Cloud Functions, please take note that:
1. Consider using [Google Cloud Secrets Manager,](https://cloud.google.com/security/products/secret-manager) rather than a `secrets.js` file. If you are doing so, please ensure that: 
	- You set an environment variable of `USE_GCP_SECRETS=true`, and 
	- You have mounted the [secrets as a volume](https://cloud.google.com/functions/docs/configuring/secrets#mounting_the_secret_as_a_volume), with the mounted volume being `/etc/secrets`  and the latest secret file as `latest.mjs`.  (The ".mjs" is not a typo - Google Cloud Function seems to have a bug regarding ESM modules for async imports.)
2. Ensure that you have a minimum of 256MB of ram allocated for this.

(The above will probably apply to other serverless function providers, such as AWS Lambda.)

# Config: Setting up what to crawl

For Confluence Cloud, there are 3 types of crawling:
1. `all`: Crawls all current pages & attachments across all Spaces in Confluence
2. `spaces`: Crawls for pages & attachments in specific spaces, as defined using the space's key.
3. `pages`: Crawl specific pages and its attachments, as defined using the the page's id. You can also configure to `includeChildPages` (default: False) and `excludePages` (default: [], an empty array) in the options.

For Jira Cloud, there is only 1 type of crawling:
1. `jql`: Crawls all Jira stories that matches any of JQL queries (you can define more than 1!). You can also configure to `includeComments` (default: False) and `includeZephyrTestSteps` (default: False) in the options.

You can see all three below being configured in `config.js` , as shown below:

```js
export const crawlTargets  = {
  everything: [
    {
      source: "confluence-cloud",
      settings: {
        type: "all",
      },
    },
  ],
  hrCorner: [
    {
      source: "confluence-cloud",
      settings: {
        type:  "spaces",
        items: ["UFCompHR", "UFUserGuide"],
      },
    },
  ],
  newBenefits: [
    {
      source: "confluence-cloud",
      settings: {
        type:  "pages",
        items: ["131104849", "138608993", "133333308"],
         options: {
           includeChildPages: true,
           excludePages: ["12446713"],
         },
      },
    },
  ],
  userSupport: [
    {
      source: "confluence-cloud",
      settings: {
        type:  "pages",
        items: ["137211523"],
      },
    },
    {
      source: "jira-cloud",
      settings: {
        type: "jql",
        items: [
          "project = PROJECTKEY AND issuetype in (Story, Task, Sub-task) AND status = Done AND description is not EMPTY ORDER BY updated DESC",
        ],
        options: {
          includeZephyrTestSteps: false,
          includeComments: true,
        },
      },
    },
    {
      source: "jira-cloud",
      settings: {
        type: "jql",
        items: ["issuekey in(PRJTEST-22494, PRJTEST-18207, PRJTEST-18208)"],
        options: {
          includeZephyrTestSteps: true,
          includeComments: true,
        },
      },
    },
  ],
};
```

The names used above (i.e `everything`, `hrCorner`, `newBenefits`, `userSupport`) will become the folder names inside Google Cloud Storage for each type of crawling activity. Hence, its important that use names that are unique and don't conflict with one another.
