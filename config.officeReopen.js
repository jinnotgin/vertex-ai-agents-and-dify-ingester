export const crawlTargets = {
	officeReopening: [
		{
			source: "confluence-cloud",
			settings: {
				type: "pages",
				items: ["189399183", "196640771"],
				options: {
					includeChildPages: true,
					excludePages: [""],
				},
			},
		},
	],
};
