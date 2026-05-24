'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function assertManagerOrOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile || !profile.is_active)
    return { error: 'Account inactive' as const, supabase: null, profile: null };
  if (profile.role !== 'owner' && profile.role !== 'manager')
    return { error: 'Only owners or managers can manage products' as const, supabase: null, profile: null };
  if (!profile.tenant_id)
    return { error: 'No tenant on profile' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export type ProductInput = {
  name: string;
  sku?: string;
  buyPrice?: number | null;
  sellPrice?: number | null;
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
};

function validate(input: ProductInput): string | null {
  if (!input.name?.trim()) return 'Name is required.';
  if (input.buyPrice != null && input.buyPrice < 0) return 'Buy price cannot be negative.';
  if (input.sellPrice != null && input.sellPrice < 0) return 'Sell price cannot be negative.';
  if (input.stockQuantity != null && input.stockQuantity < 0) return 'Stock cannot be negative.';
  if (input.lowStockThreshold != null && input.lowStockThreshold < 0)
    return 'Low-stock threshold cannot be negative.';
  return null;
}

export async function createProductAction(input: ProductInput): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase.from('products').insert({
    tenant_id: guard.profile.tenant_id,
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    buy_price: input.buyPrice ?? null,
    sell_price: input.sellPrice ?? null,
    stock_quantity: input.stockQuantity ?? 0,
    low_stock_threshold: input.lowStockThreshold ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  revalidatePath('/dashboard/rep');
  return { ok: true, message: 'Product added' };
}

export async function updateProductAction(
  id: string,
  input: ProductInput,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase
    .from('products')
    .update({
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      buy_price: input.buyPrice ?? null,
      sell_price: input.sellPrice ?? null,
      stock_quantity: input.stockQuantity ?? 0,
      low_stock_threshold: input.lowStockThreshold ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  revalidatePath('/dashboard/rep');
  return { ok: true, message: 'Product updated' };
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };

  const { error } = await guard.supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  revalidatePath('/dashboard/rep');
  return { ok: true, message: 'Product deleted' };
}
