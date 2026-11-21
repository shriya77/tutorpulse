/**
 * Shared permission building blocks so every collection states the same
 * baseline explicitly: signed-out visitors ('*') and anonymous viewers get
 * nothing, admins get everything (for debugging). Each schema then spells out
 * its own `member` rule — that line is the one to review.
 */

import type { RolePermissions } from 'deepspace/schema'

export const DENY_ALL: RolePermissions = { read: false, create: false, update: false, delete: false }

export const ADMIN_ALL: RolePermissions = { read: true, create: true, update: true, delete: true }

/** Server-written collections: members may only read rows they are listed on. */
export const MEMBER_READ_COLLABORATOR_ONLY: RolePermissions = {
  read: 'collaborator',
  create: false,
  update: false,
  delete: false,
}
