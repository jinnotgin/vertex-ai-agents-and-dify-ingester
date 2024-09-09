export const crawlTargets = {
  ufinityPeteOrg: {
    uploadDestination: "gcp", // "gcp" or "dify"
    targets: [
      {
        source: "confluence-cloud",
        settings: {
          type: "spaces",
          items: ["UFCompHR"],
          options: {
            bannedAttachmentPatterns: [
              /.*TIMES.*(\.pdf)/,  // Prevent TIMES official guides from being stored
              /.*Times.*User Manual.*(\.pdf)/,  // Prevent TIMES user manual from being stored
              /YourGuideToHealthInsurance.*(\.pdf)/,  
            ], 
          },
        },
      },
      {
        source: "confluence-cloud",
        settings: {
          type: "spaces",
          items: ["UFUserGuide"],
        },
      },
      {
        source: "web",
        settings: {
          type: "url",
          items: [
            "https://support.microsoft.com/en-us/office/learn-more-about-outlook-on-the-web-adbacbab-fe59-4259-a550-6cb7f85f19ec",  // videos for Outlook Web
            "https://support.microsoft.com/office/b30da4eb-ddd2-44b6-943b-e6fbfc6b8dde",  // videos for Onedrive
            "https://learn.microsoft.com/en-us/microsoftteams/teams-security-best-practices-for-safer-messaging",  // security best practices for Teams messages
            "https://support.microsoft.com/en-us/office/use-the-web-version-of-outlook-like-a-desktop-app-b360bd9a-00dc-43a4-bdf8-71cdeeb78e83", // how to install Outlook Web as PWA
          ],  
        },
        options: {
          includeLinks: false,
        },
      },
      {
        source: "web",
        settings: {
          type: "url",
          items: [
            "https://support.microsoft.com/en-us/office/get-help-with-outlook-on-the-web-cf659288-35cc-4c6c-8c75-e8e4317fda11", 
            "https://support.microsoft.com/en-gb/office/outlook-for-ios-and-android-help-cd84214e-a5ac-4e95-9ea3-e07f78d0cde6",
            "https://support.microsoft.com/en-us/office/first-things-to-know-about-chats-in-microsoft-teams-88ed0a06-6b59-43a3-8cf7-40c01f2f92f2",
            "https://support.microsoft.com/en-us/office/manage-team-settings-and-permissions-in-microsoft-teams-ce053b04-1b8e-4796-baa8-90dc427b3acc",
          ],
          options: {
            includeLinks: true,
            regex: "https://support\\.microsoft\\.com/en-us/office/.*",
            bannedUrlPatterns: [
              /.*4414eaaf-0478-48be-9c42-23adc4716658.*/,  // Skip page to install Office 2021 on PC / Mac 
              /.*office-2021.*/,  // Skip pages about Office 2021 
            ],
            bannedTitlePatterns: [
              /.*office 20.*/i,  // Skip titles with "office 20xx"
            ],
            depth: 2,
          },
        },
      },
    ],
  },
};
