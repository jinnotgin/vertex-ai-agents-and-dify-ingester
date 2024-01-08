export const crawlTargets = {
	// everything: {
	// 	type: "all",
	// },
	// hrCorner: {
	// 	type: "spaces",
	// 	items: ["UFCompHR", "UFUserGuide"],
	// },
	// officeReopening: {
	// 	type: "pages",
	// 	items: ["131104849", "138608993", "133333308"],
	// },
	officeReopening: {
		type: "pages",
		items: ["189399183"],
		options: {
			includeChildPages: true,
			excludePages: ["189399183"],
		},
	},
};
