export const CONFLUENCE_GET_ALL_SPACES_ENDPOINT = "/wiki/api/v2/spaces";
export const CONFLUENCE_GET_ALL_PAGES_ENDPOINT = "/wiki/api/v2/pages";
export const CONFLUENCE_GET_ALL_ATTACHMENTS_ENDPOINT =
	"/wiki/api/v2/attachments";
export const CONFLUENCE_GET_PAGE_BY_ID_ENDPOINT = "/wiki/api/v2/pages/{id}";
export const CONFLUENCE_GET_CHILD_PAGES_ENDPOINT =
	"/wiki/api/v2/pages/{id}/children";
export const CONFLUENCE_GET_ALL_ATTACHMENTS_FOR_PAGE_ENDPOINT =
	"/wiki/api/v2/pages/{id}/attachments";

export const VERTEX_AI_ALLOWED_FILE_EXTENSION_TYPE_MAP = {
	pdf: "application/pdf",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const DIFY_RATE_LIMIT_PER_MINUTE = 80;

export const JIRA_JQL_SEARCH_ENDPOINT = "/rest/api/3/search";
export const JIRA_GET_ISSUE_ENDPOINT = "/rest/api/3/issue/{id}";
export const JIRA_GET_ISSUE_COMMENTS_ENDPOINT =
	"/rest/api/3/issue/{id}/comment";
export const JIRA_JQL_QUERY_TEMPLATES = {
	ALL_EPICS: `project = {projectKey} AND issuetype = Epic`,
	STORIES_IN_EPIC_SLS: `project = SLS AND status = Done AND 'Epic Link' = {epicIssueKey} ORDER BY updated DESC`, // this one is custom for SLS
};

export const ZEPHYR_SQUAD_BASE_URL =
	"https://prod-api.zephyr4jiracloud.com/connect";
export const ZEPHYR_SQUAD_GET_TEST_STEPS_ENDPOINT =
	"/public/rest/api/2.0/teststep/{issueId}?projectId={projectId}";
