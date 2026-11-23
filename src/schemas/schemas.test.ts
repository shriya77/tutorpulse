import { describe, expect, it } from 'vitest'
import { lintSchema } from 'deepspace/worker'
import { schemas } from '../schemas'

/**
 * Guardrails on the permission model. These are cheap, run on every
 * `npm run test:unit`, and fail if someone loosens a rule by accident.
 */
describe('collection schemas', () => {
  it.each(schemas.map((s) => [s.name, s] as const))('%s passes the SDK schema lint', (_name, schema) => {
    expect(lintSchema(schema)).toEqual([])
  })

  it.each(schemas.map((s) => [s.name, s] as const))('%s denies signed-out visitors explicitly', (_name, schema) => {
    expect(schema.permissions['*']).toEqual({ read: false, create: false, update: false, delete: false })
  })

  it.each(['submissions', 'clusters', 'practiceSets', 'followUps', 'recapRequests'])('%s is never client-writable', (name) => {
    const schema = schemas.find((s) => s.name === name)!
    for (const [role, perms] of Object.entries(schema.permissions)) {
      if (role === 'admin') continue
      expect({ role, create: perms.create, update: perms.update, delete: perms.delete }).toEqual({
        role,
        create: false,
        update: false,
        delete: false,
      })
    }
  })

  it('answerKeys are readable only by their owner', () => {
    const schema = schemas.find((s) => s.name === 'answerKeys')!
    expect(schema.permissions.member.read).toBe('own')
  })

  it('a tutor client cannot write server-owned session fields', () => {
    const schema = schemas.find((s) => s.name === 'sessions')!
    const writable = schema.permissions.member.writableFields ?? []
    for (const field of ['joinCode', 'status', 'participantIds', 'clusterRuns', 'practiceSetRuns', 'hintTurns']) {
      expect(writable).not.toContain(field)
    }
  })
})
