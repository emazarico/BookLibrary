import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../types/library';
import { getHouseholdAdmins, isProfileAdmin } from '../utils/admin';

function makeProfile(id: string, name: string, role?: 'admin' | 'member'): UserProfile {
  return {
    id,
    name,
    avatarEmoji: '🦉',
    avatarTheme: 'amber',
    role,
    pinHash: null,
    yearlyBookGoal: 12,
    monthlyPageGoal: 500,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('household admin role helpers', () => {
  it('respects explicit admin and member roles', () => {
    const alex = makeProfile('p1', 'Alex', 'member');
    const maya = makeProfile('p2', 'Maya', 'admin');
    const profiles = [alex, maya];

    expect(isProfileAdmin(alex, profiles)).toBe(false);
    expect(isProfileAdmin(maya, profiles)).toBe(true);
    expect(getHouseholdAdmins(profiles).map((p) => p.id)).toEqual(['p2']);
  });

  it('falls back to the first active profile when legacy backups lack explicit roles', () => {
    const first = makeProfile('p1', 'First');
    const second = makeProfile('p2', 'Second');
    const profiles = [first, second];

    expect(isProfileAdmin(first, profiles)).toBe(true);
    expect(isProfileAdmin(second, profiles)).toBe(false);
  });

  it('supports multiple household admins simultaneously', () => {
    const p1 = makeProfile('p1', 'Mom', 'admin');
    const p2 = makeProfile('p2', 'Dad', 'admin');
    const p3 = makeProfile('p3', 'Kid', 'member');

    expect(getHouseholdAdmins([p1, p2, p3]).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
