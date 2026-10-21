import {TEMPORARY_INTERNET_PREVIEW} from './temporary-preview-config.mjs';
// Set false to disable OCR while preserving manual registration and existing data.
export const FEATURES = {
 temporaryInternetPreview: TEMPORARY_INTERNET_PREVIEW,
 photoRecognition: true,
 localRapidOcr: true,
 // Set false to fall back to the per-computer RapidOCR workflow.
 browserOcr: true,
 collegeWorkspaces: true,
 collegeDirectory: true,
 archivedCollegeDeletion: true,
 sidCohort: true,
 collegeTeamLast: true,
 preserveExcelOrder: true,
 comfortHeader: true,
 // Set false to restore the shared heading, filters and statistics on every tab.
 independentPages: true,
 // Restore the previous landing page without changing stored school data.
 todoDashboard: true,
 // Return to the flat activity history without changing stored activities.
 groupActivityArchives: true,
 // Hide college summary cards while retaining individual group archives.
 collegeActivityOverview: true,
 // Disable sharing unassigned staff uploads with their college lead.
 collegePhotoSharing: true,
 sixCharacterPasswords: true,
 mobileLanPreview: true,
 mobileUsability: true,
 yearlyRosters: true,
 semesterArchives: true,
 confirmedGradeLock: true,
 adminRecognitionSettings: true,
 // Set false to restore single-request Excel imports (up to 10,000 rows).
 rosterBatchImport: true,
 autoGroupRecognition: true,
 automaticPhotoRegistration: true,
 mixedGroupPhoto: true,
 manualScoreEntry: true,
 editableExportPreview: true,
 activityRating: true,
 // UI rollback only; saved five-tier ratings remain readable and keep their rates.
 fiveLevelRating: true,
 photoRatingRecognition: true,
 manualPhotoRating: true,
 recorderActivityRating: true,
 photoActivityDateGuard: true,
 sharedRoles: true,
 gradeRosterManagement: true,
 duplicateStudentNumbers: true,
 collegeRosterClear: true,
 groupCohortScope: true,
 studentGradeManagement: true,
 // Set false and republish to return to the previous ChatGPT login while retaining local accounts.
 localAccounts: true,
 concurrentQueries: true,
 // Disable to restore the previous login admission and 20-second refresh baseline.
 stabilityProtection: true,
 // Restore legacy write paths only as part of a deliberate source rollback.
 atomicMutations: true,
 // Disable health probes, bounded JSON parsing and the in-page recovery button.
 operationalSafety: true,
 resilientLogin: true,
 memberAccountManagement: true,
 collegeStaffDirectory: true,
 continuousPhotoUpload: true,
 photoUploadReview: true,
 unrecognizedPhotoDeletion: true,
 directScoreEntry: true,
 draftDeletion: true,
 activityDeletion: true,
 rememberOcrCredentials: true
};
