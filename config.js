export const crawlTargets = {
	// old format
	// everything: {
	// 	type: "all",
	// },
	// hrCorner: {
	// 	type: "spaces",
	// 	items: ["UFCompHR", "UFUserGuide"],
	// },
	// officeReopening: {
	// 	type: "pages",
	// 	items: ["189399183", "196640771"],
	// 	options: {
	// 		includeChildPages: true,
	// 		excludePages: [""],
	// 	},
	// },
	//
	// new format
	slsUatSupport: [
		{
			source: "confluence-cloud",
			settings: {
				type: "pages",
				items: ["47939637"],
				options: {
					includeChildPages: true,
					excludePages: [""],
				},
			},
		},
		{
			source: "jira-cloud",
			settings: {
				type: "jql",
				items: ["issuekey in(SLSTEST-22494, SLSTEST-18207, SLSTEST-18208)"],
				options: {
					includeZephyrTestSteps: true,
					includeComments: true,
				},
			},
		},
	],
	betaSLSGuru: [
		{
			source: "jira-cloud",
			settings: {
				type: "jql",
				items: [
					"project = SLS AND issuetype in (Story, Task, Sub-task) AND status = Done AND description is not EMPTY ORDER BY updated DESC",
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
				type: "epic-issue-summary-SLS",
			},
		},
		{
			source: "confluence-cloud",
			settings: {
				type: "pages",
				items: ["4326533", "4326863"],
				options: {
					includeChildPages: true,
					excludePages: ["4326533", "4326863"],
				},
			},
		},
	],
};
