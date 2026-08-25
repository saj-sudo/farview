/**
 * API-defined basic structure ids. These are constants of the Capacities
 * API itself, present in every space — they are NOT user schema, and they
 * are the only structure ids permitted to appear in code (spec §4).
 */
export const TAG_STRUCTURE_ID = 'RootTag';
export const PAGE_STRUCTURE_ID = 'RootPage';

/** Known deep-link base. */
export const APP_BASE = 'https://app.capacities.io';

const BASIC_STRUCTURE_IDS = new Set([
  'RootDailyNote', 'RootTag', 'RootPage', 'RootDatabase', 'RootStructure',
  'RootSpace', 'RootQuery', 'RootEntity', 'RootBlocksTemplate', 'RootAIChat',
  'RootSimpleTable', 'RootTask', 'UtilDate', 'User', 'UserPersonal',
  'MediaImage', 'MediaPDF', 'MediaAudio', 'MediaVideo', 'MediaFile',
  'MediaWebResource', 'MediaTweet',
]);

/**
 * Is this structure one of the API's built-ins rather than a user type?
 * Verified against a real space: basic structures can also appear under
 * internal near-zero UUIDs (e.g. 00000000-0000-0100-…), so both forms
 * count. These are API constants, not user schema.
 */
export function isBasicStructure(structureId: string): boolean {
  return BASIC_STRUCTURE_IDS.has(structureId) || structureId.startsWith('00000000-0000-');
}
