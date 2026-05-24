export type Role = 'super_admin' | 'owner' | 'manager' | 'rep';

export type Profile = {
  id: string;
  tenant_id: string | null;
  full_name: string;
  role: Role;
  phone: string | null;
  is_active: boolean;
  email?: string;
};

export type Tenant = {
  id: string;
  status: 'active' | 'suspended' | string;
  suspension_reason: string | null;
  business_name: string | null;
  name: string | null;
  plan: string | null;
  subscription_expires_at: string | null;
  business_mode: string | null;
};
