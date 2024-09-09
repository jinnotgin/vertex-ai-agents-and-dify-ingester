export const crawlTargets = {
	slsGuru: {
		uploadDestination: "dify", // "gcp" or "dify"
		targets: [
			{
				source: "jira-cloud",
				settings: {
					type: "jql",
					items: [
						"project = SLS AND issuetype in (Story, Task, Sub-task) AND status = Done AND description is not EMPTY ORDER BY updated DESC",
						"project = SLS AND issuetype in (Story, Task, Sub-task) AND sprint in openSprints()",
					],
					options: {
						includeZephyrTestSteps: false,
						includeComments: false,
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
	},
	// slsUatSupport: {
	// 	uploadDestination: "dify", // "gcp" or "dify"
	// 	targets: [
	// 		{
	// 			source: "confluence-cloud",
	// 			settings: {
	// 				type: "pages",
	// 				items: ["48005191"],
	// 				options: {
	// 					includeChildPages: true,
	// 					excludePages: [""],
	// 				},
	// 			},
	// 		},
	// 		{
	// 			source: "jira-cloud",
	// 			settings: {
	// 				type: "jql",
	// 				items: [
	// 					`project = SLSTEST AND issuetype = Test AND summary ~ UAT AND fixVersion = 2P1AS2`,
	// 					// `project = SLSTEST AND summary ~ "\"[UAT]\"" AND issuetype = Test AND fixVersion = 2P1AS2`,
	// 				],
	// 				options: {
	// 					includeZephyrTestSteps: false,
	// 					includeComments: false,
	// 				},
	// 			},
	// 		},
	// 	],
	// },
};
