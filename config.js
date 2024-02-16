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
			settings: {},
		},
	],
};
