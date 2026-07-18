export type Role = 'super_admin' | 'owner' | 'manager' | 'rep';

export const KNOWN_ROLES: readonly Role[] = ['super_admin', 'owner', 'manager', 'rep'];

// The deployed web app — full dashboards live there until they are ported
// into this app natively.
export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'https://stockflow.com.ng';

export function isKnownRole(role: string | null | undefined): role is Role {
  return (KNOWN_ROLES as readonly string[]).includes(role ?? '');
}

// Mirrors window.dashboardForRole in supabase-client.js.
export function webDashboardForRole(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return `${WEB_APP_URL}/admin-dashboard.html`;
    case 'owner':
      return `${WEB_APP_URL}/owner-dashboard.html`;
    case 'manager':
      return `${WEB_APP_URL}/manager-dashboard.html`;
    case 'rep':
      return `${WEB_APP_URL}/rep-dashboard.html`;
    default:
      return `${WEB_APP_URL}/login.html`;
  }
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin';
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'rep':
      return 'Sales rep';
    default:
      return 'Unknown role';
  }
}
