/** App name — replaced by the CLI during scaffolding */
export const APP_NAME = 'tutorpulse'
/** Immutable app identity — data scope keys to this, so renames never
 *  strand your records. */
export const APP_ID = 'app_01M7ZP8D6VYFGEZXFVEZ2HX5YS'

/** Primary scope ID for the app's RecordRoom DO */
export const SCOPE_ID = `app:${APP_ID}`

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'
