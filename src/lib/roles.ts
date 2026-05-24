import type { Role } from './types';

export function dashboardForRole(role: Role | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/dashboard/admin';
    case 'owner':
      return '/dashboard/owner';
    case 'manager':
      return '/dashboard/manager';
    case 'rep':
      return '/dashboard/rep';
    default:
      return '/login';
  }
}
