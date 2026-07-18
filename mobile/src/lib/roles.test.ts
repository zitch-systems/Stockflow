import { describe, expect, it } from 'vitest';
import { isKnownRole, roleLabel, webDashboardForRole, WEB_APP_URL } from './roles';

describe('webDashboardForRole', () => {
  it('maps every known role to its dashboard on the web app', () => {
    expect(webDashboardForRole('super_admin')).toBe(`${WEB_APP_URL}/admin-dashboard.html`);
    expect(webDashboardForRole('owner')).toBe(`${WEB_APP_URL}/owner-dashboard.html`);
    expect(webDashboardForRole('manager')).toBe(`${WEB_APP_URL}/manager-dashboard.html`);
    expect(webDashboardForRole('rep')).toBe(`${WEB_APP_URL}/rep-dashboard.html`);
  });

  it('falls back to the web login for unknown or missing roles', () => {
    expect(webDashboardForRole('intern')).toBe(`${WEB_APP_URL}/login.html`);
    expect(webDashboardForRole(null)).toBe(`${WEB_APP_URL}/login.html`);
    expect(webDashboardForRole(undefined)).toBe(`${WEB_APP_URL}/login.html`);
  });
});

describe('isKnownRole', () => {
  it('accepts exactly the four StockFlow roles', () => {
    expect(isKnownRole('super_admin')).toBe(true);
    expect(isKnownRole('owner')).toBe(true);
    expect(isKnownRole('manager')).toBe(true);
    expect(isKnownRole('rep')).toBe(true);
    expect(isKnownRole('admin')).toBe(false);
    expect(isKnownRole('')).toBe(false);
    expect(isKnownRole(null)).toBe(false);
  });
});

describe('roleLabel', () => {
  it('renders human-readable labels', () => {
    expect(roleLabel('rep')).toBe('Sales rep');
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('manager')).toBe('Manager');
    expect(roleLabel('super_admin')).toBe('Super admin');
    expect(roleLabel('mystery')).toBe('Unknown role');
  });
});
