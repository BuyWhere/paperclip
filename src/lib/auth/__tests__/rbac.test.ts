import { hasRole, canAccess, getEnabledFlags } from '../rbac'
import type { UserRole } from '../rbac'

describe('RBAC', () => {
  describe('hasRole', () => {
    it('admin has all roles', () => {
      const roles: UserRole[] = ['user', 'premium', 'pro', 'admin']
      for (const r of roles) expect(hasRole('admin', r)).toBe(true)
    })

    it('user only has user role', () => {
      expect(hasRole('user', 'user')).toBe(true)
      expect(hasRole('user', 'premium')).toBe(false)
      expect(hasRole('user', 'pro')).toBe(false)
      expect(hasRole('user', 'admin')).toBe(false)
    })

    it('premium can access premium but not pro/admin', () => {
      expect(hasRole('premium', 'user')).toBe(true)
      expect(hasRole('premium', 'premium')).toBe(true)
      expect(hasRole('premium', 'pro')).toBe(false)
    })
  })

  describe('canAccess', () => {
    it('all users can access dashboard', () => {
      const roles: UserRole[] = ['user', 'premium', 'pro', 'admin']
      for (const r of roles) expect(canAccess(r, 'dashboard')).toBe(true)
    })

    it('only admin can access adminPanel', () => {
      expect(canAccess('user', 'adminPanel')).toBe(false)
      expect(canAccess('premium', 'adminPanel')).toBe(false)
      expect(canAccess('pro', 'adminPanel')).toBe(false)
      expect(canAccess('admin', 'adminPanel')).toBe(true)
    })

    it('premium can access archetypeDeep and driftCoaching', () => {
      expect(canAccess('premium', 'archetypeDeep')).toBe(true)
      expect(canAccess('premium', 'driftCoaching')).toBe(true)
      expect(canAccess('user', 'archetypeDeep')).toBe(false)
    })

    it('pro can access priorityAi and personaExport', () => {
      expect(canAccess('pro', 'priorityAi')).toBe(true)
      expect(canAccess('pro', 'personaExport')).toBe(true)
      expect(canAccess('premium', 'priorityAi')).toBe(false)
    })
  })

  describe('getEnabledFlags', () => {
    it('user gets only dashboard', () => {
      expect(getEnabledFlags('user')).toEqual(['dashboard'])
    })

    it('admin gets all flags', () => {
      const flags = getEnabledFlags('admin')
      expect(flags).toContain('dashboard')
      expect(flags).toContain('adminPanel')
      expect(flags).toContain('priorityAi')
    })
  })
})
