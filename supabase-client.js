// ============================================================================
// supabase-client.js — shared auth + database helpers for StockFlow
// ============================================================================
// Every page loads this AFTER the Supabase library tag.
// Exposes globals on `window` for use across pages.
// ============================================================================

const SUPABASE_URL = 'https://fjmkenowgfxepwpyjcss.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbWtlbm93Z2Z4ZXB3cHlqY3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDEzNjAsImV4cCI6MjA5MjY3NzM2MH0.cR1azmmJlYGEnjVgIDntINMzorjUS6Ftu_ex_KJFfUM';

// Initialize the client (window.supabase is from the CDN library)
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Cache for the current user's profile, populated by requireAuth()
window.currentProfile = null;

// ----------------------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------------------

/**
 * Returns the dashboard URL for a given role.
 */
window.dashboardForRole = function(role) {
  switch (role) {
    case 'super_admin': return 'admin-dashboard.html';   // we build this in Phase 3
    case 'owner':       return 'owner-dashboard.html';
    case 'manager':     return 'manager-dashboard.html';
    case 'rep':         return 'rep-dashboard.html';
    default:            return 'login.html';
  }
};

/**
 * Page guard. Call at the top of every protected page.
 *   await requireAuth(['rep']);             // only reps allowed
 *   await requireAuth(['manager','owner']); // multiple roles
 *   await requireAuth();                    // any authenticated user
 *
 * If user is not logged in, redirects to login.html.
 * If user has a role NOT in allowedRoles, redirects to their correct dashboard.
 * On success, populates window.currentProfile and returns it.
 */
window.requireAuth = async function(allowedRoles) {
  const { data: { session } } = await window.sb.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  // Fetch the user's profile (joined with email from auth.users)
  let { data: profile, error } = await window.sb
    .from('profiles')
    .select('id, tenant_id, full_name, role, phone, is_active')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    // Profile missing — could be:
    // 1. Email not confirmed (trigger hasn't created profile)
    // 2. Manually-created Supabase auth user without a profile row
    // 3. DB trigger failed silently
    try {
      const meta = session.user.user_metadata || {};
      const tenantId = meta.tenant_id || null;
      // IMPORTANT: Only use meta.role if explicitly set — never default to 'owner'
      // Defaulting to 'owner' causes ALL accounts without metadata to land on owner-dashboard
      const role = meta.role || null;

      if (tenantId && role && role !== 'owner') {
        // Staff member added via admin — create profile pointing to existing tenant
        await window.sb.from('profiles').upsert({
          id: session.user.id,
          tenant_id: tenantId,
          full_name: meta.full_name || session.user.email.split('@')[0],
          phone:     meta.phone || null,
          role:      role,
          is_active: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } else if (tenantId && role === 'owner') {
        // Owner created via admin createTenant() flow
        await window.sb.from('profiles').upsert({
          id: session.user.id,
          tenant_id: tenantId,
          full_name: meta.full_name || session.user.email.split('@')[0],
          phone:     meta.phone || null,
          role:      'owner',
          is_active: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } else {
        // No tenant_id and no role in metadata → profile creation failed or
        // account was created manually in Supabase dashboard without metadata.
        // Cannot determine role — sign out and show error.
        console.error('[requireAuth] Profile missing, no metadata. DB trigger may have failed.');
        await window.sb.auth.signOut();
        window.location.href = 'login.html?err=profile_missing';
        return null;
      }

      // Re-fetch the profile
      const { data: profile2, error: e2 } = await window.sb
        .from('profiles').select('id,tenant_id,full_name,role,phone,is_active')
        .eq('id', session.user.id).single();

      if (e2 || !profile2) {
        await window.sb.auth.signOut();
        window.location.href = 'login.html?err=profile_missing';
        return null;
      }
      // Use the recovered profile, then fall through to the shared
      // is_active / role / tenant-suspension checks below. Returning here
      // would bypass those guards.
      profile = profile2;
    } catch(recoverErr) {
      console.error('Profile recovery failed:', recoverErr);
      await window.sb.auth.signOut();
      window.location.href = 'login.html?err=profile_missing';
      return null;
    }
  }

  if (!profile.is_active) {
    alert('Your account has been deactivated. Contact your administrator.');
    await window.sb.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  // Role check
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    window.location.href = window.dashboardForRole(profile.role);
    return null;
  }

  // Stash email for convenience
  profile.email = session.user.email;

  window.currentProfile = profile;

  // Tenant suspension check (skipped for super admin who has no tenant)
  if (profile.role !== 'super_admin' && profile.tenant_id) {
    try {
      const { data: tenant } = await window.sb
        .from('tenants')
        .select('status, suspension_reason, business_name, name, plan, subscription_expires_at, business_mode')
        .eq('id', profile.tenant_id)
        .single();
      if (tenant && tenant.status === 'suspended') {
        showSuspensionBanner(tenant);
      }

      // Subscription expiry check
      if (tenant && tenant.subscription_expires_at) {
        const expiry  = new Date(tenant.subscription_expires_at);
        const now     = new Date();
        const daysLeft = Math.ceil((expiry - now) / 86400000);
        if (daysLeft <= 0) {
          showExpiryBanner(tenant, 0);
        } else if (daysLeft <= 7) {
          showExpiryBanner(tenant, daysLeft);
        }
      }

      // Store tenant info on profile for dashboards to use
      if (tenant) {
        profile.plan             = tenant.plan || 'starter';
        profile.business_mode    = tenant.business_mode || 'owner_rep';
        profile.subscription_expires_at = tenant.subscription_expires_at;
      }
    } catch (err) {
      console.warn('Tenant status check failed:', err);
    }
  }

  return profile;
};

/**
 * Inject a persistent banner at the top of the page when the tenant is
 * suspended. Lenient mode — the user can still see their dashboard but
 * a clear notice tells them to contact support.
 */
function showSuspensionBanner(tenant) {
  // Don't double-inject
  if (document.getElementById('suspensionBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'suspensionBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#DC2626;color:#fff;padding:8px 14px;font-family:DM Sans,sans-serif;font-size:.78rem;font-weight:500;z-index:10000;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.15)';
  const reason = tenant.suspension_reason ? ` Reason: ${tenant.suspension_reason}.` : '';
  banner.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span style="flex:1"><strong>Account suspended.</strong>${reason} Some actions may be blocked. Contact support to reactivate.</span>`;
  document.body.insertBefore(banner, document.body.firstChild);
  // Push everything below down so it doesn't get hidden under the banner
  document.body.style.paddingTop = (banner.offsetHeight) + 'px';
}

/**
 * Show amber banner when subscription is expired or expiring soon.
 */
function showExpiryBanner(tenant, daysLeft) {
  if (document.getElementById('expiryBanner')) return;
  const banner  = document.createElement('div');
  banner.id     = 'expiryBanner';
  const expired = daysLeft <= 0;
  banner.style.cssText = `position:fixed;top:0;left:0;right:0;background:${expired ? '#92400E' : '#B45309'};color:#fff;padding:8px 14px;font-family:DM Sans,sans-serif;font-size:.78rem;font-weight:500;z-index:10000;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.15)`;
  const biz = tenant.business_name || tenant.name || 'Your account';
  const msg = expired
    ? `⚠ ${biz}: subscription expired. Contact support to renew.`
    : `⏰ ${biz}: subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew soon.`;
  banner.innerHTML = `<span style="flex:1">${msg}</span>
    <a href="mailto:support@stockflow.com.ng" style="color:#FDE68A;font-weight:700;white-space:nowrap">Renew now</a>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.2rem;padding:0 4px;line-height:1">×</button>`;
  document.body.prepend(banner);
}

/**
 * Sign out and return to login.
 */
window.logout = async function() {
  if (!confirm('Log out?')) return;
  await window.sb.auth.signOut();
  window.location.href = 'login.html';
};

// ----------------------------------------------------------------------------
// File upload helper
// ----------------------------------------------------------------------------

/**
 * Upload a file to a Supabase Storage bucket using the path convention
 *   {tenant_id}/{user_id}/{timestamp}-{filename}
 * which matches the RLS policies set up in stockflow-rls-policies.sql.
 *
 * Returns the storage path on success, throws on failure.
 */
window.uploadFile = async function(bucket, file) {
  if (!window.currentProfile) throw new Error('Not authenticated');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${window.currentProfile.tenant_id}/${window.currentProfile.id}/${Date.now()}-${safeName}`;
  const { error } = await window.sb.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  return path;
};

/**
 * Toast with title + subtitle (used for confirmations)
 */
window.toastSuccess = function(title, sub) {
  const msg = sub ? title + ' — ' + sub : title;
  window.toast(msg, 'ok');
};

/**
 * Get a signed URL to download/view a private file (expires in 1 hour).
 */
window.getSignedUrl = async function(bucket, path) {
  const { data, error } = await window.sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
};

// ----------------------------------------------------------------------------
// UI helpers (shared across all dashboards)
// ----------------------------------------------------------------------------

/**
 * Format a number as Naira: 12500 -> "₦12,500"
 */
window.formatNaira = function(amount) {
  if (amount == null || isNaN(amount)) return '₦0';
  return '₦' + Number(amount).toLocaleString('en-NG');
};

/**
 * Show a toast notification. Requires a div#toast in the HTML.
 *   toast('Saved!', 'ok')
 *   toast('Error occurred', 'err')
 */
// ─────────────────────────────────────────────────────────────
// Unified Toast Notification System
// Auto-injects #sf-toast container; works on every page.
// Usage: window.toast('Message', 'ok' | 'err' | 'warn')
// ─────────────────────────────────────────────────────────────
(function ensureToastContainer() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectToast);
  } else {
    _injectToast();
  }
  function _injectToast() {
    if (document.getElementById('sf-toast')) return;
    const el = document.createElement('div');
    el.id = 'sf-toast';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed',
      'bottom:calc(env(safe-area-inset-bottom,0px) + 76px)',
      'left:50%',
      'transform:translateX(-50%) translateY(16px)',
      'min-width:180px',
      'max-width:min(90vw,360px)',
      'background:#0F1923',
      'color:#fff',
      'padding:10px 18px 10px 12px',
      'border-radius:999px',
      'font-family:DM Sans,system-ui,sans-serif',
      'font-size:.82rem',
      'font-weight:500',
      'z-index:99999',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'box-shadow:0 6px 24px rgba(0,0,0,.3)',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'opacity:0',
      'transition:opacity .2s ease,transform .2s ease',
      'pointer-events:none',
      '-webkit-font-smoothing:antialiased'
    ].join(';');
    document.body.appendChild(el);
  }
})();

let _sfToastTimer = null;

window.toast = function(msg, type) {
  let t = document.getElementById('sf-toast');
  if (!t) {
    // Fallback: create inline if container injection missed
    t = document.createElement('div');
    t.id = 'sf-toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0F1923;color:#fff;padding:10px 18px;border-radius:999px;font-size:.82rem;z-index:99999;opacity:0;transition:opacity .2s;font-family:DM Sans,sans-serif';
    document.body.appendChild(t);
  }

  const ICONS = {
    ok:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>',
    err:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  const COLORS = { ok: '#16A34A', err: '#DC2626', warn: '#D97706' };

  t.innerHTML = (ICONS[type] || '') + '<span style="overflow:hidden;text-overflow:ellipsis">' + String(msg) + '</span>';
  t.style.background = COLORS[type] || '#0F1923';
  t.style.opacity    = '1';
  t.style.transform  = 'translateX(-50%) translateY(0)';

  if (_sfToastTimer) clearTimeout(_sfToastTimer);
  _sfToastTimer = setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(16px)';
  }, 3000);
};

// Copy plain text to the clipboard. Returns Promise<boolean>. Uses the async
// Clipboard API in secure contexts and falls back to a hidden-textarea +
// execCommand('copy') for older WebViews / non-secure origins, so it works
// across the phones Nigerian reps actually use.
window.copyText = async function(text) {
  text = String(text == null ? '' : text);
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { /* fall through to the legacy path */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
};

// ─────────────────────────────────────────────────────────────
// Attachment Manager — multi-file, thumbnail previews, delete
// ─────────────────────────────────────────────────────────────
// Usage:
//   window.initAttachmentZone({ id, bucket, maxFiles, label, existingPaths })
//   const paths = await window.uploadAllAttachments(id); // string[]
//   window.resetAttachmentZone(id);
// ─────────────────────────────────────────────────────────────

const _sfAttachZones = {};

window.initAttachmentZone = function({ id, bucket, maxFiles = 5, label = 'Attachments', existingPaths = [] }) {
  _sfAttachZones[id] = { bucket, maxFiles, label, files: [], existingPaths: [...existingPaths] };
  _sfRenderAttachZone(id);
};

function _sfRenderAttachZone(id) {
  const container = document.getElementById(id);
  if (!container) return;
  const z = _sfAttachZones[id];
  if (!z) return;

  const allCount = z.existingPaths.length + z.files.length;
  const canAdd   = allCount < z.maxFiles;

  const thumbStyle = 'position:relative;width:62px;height:62px;border-radius:8px;border:1px solid #E2E8F0;background:#F8FAFC;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0';
  const delBtnStyle = 'position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#DC2626;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;font-family:sans-serif;font-weight:700;padding:0';

  const existingHtml = z.existingPaths.map((p, i) => {
    const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(p);
    const thumb = isImg
      ? `<img src="${p}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    return `<div style="${thumbStyle}">${thumb}<button style="${delBtnStyle}" onclick="window._sfRemoveExisting('${id}',${i})" aria-label="Remove">✕</button></div>`;
  }).join('');

  const stagedHtml = z.files.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const url   = URL.createObjectURL(f);
    const thumb = isImg
      ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`
      : `<div style="font-size:.55rem;color:#5A6A7A;text-align:center;padding:4px;word-break:break-all;overflow:hidden">${f.name}</div>`;
    return `<div style="${thumbStyle}">${thumb}<button style="${delBtnStyle}" onclick="window._sfRemoveStaged('${id}',${i})" aria-label="Remove">✕</button></div>`;
  }).join('');

  const addHtml = canAdd
    ? `<label style="width:62px;height:62px;border-radius:8px;border:2px dashed #CBD5E1;background:#F8FAFC;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#94A3B8;font-size:.6rem;gap:3px;flex-shrink:0;text-align:center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add
        <input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="window._sfOnAttachChange('${id}',this)">
      </label>`
    : '';

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${existingHtml}${stagedHtml}${addHtml}</div>
    <div style="font-size:.65rem;color:#94A3B8">${allCount}/${z.maxFiles} ${z.label}</div>
  `;
}

window._sfOnAttachChange = function(id, input) {
  const z = _sfAttachZones[id];
  if (!z) return;
  const incoming = Array.from(input.files || []);
  const available = z.maxFiles - z.existingPaths.length - z.files.length;
  if (available <= 0) { window.toast(`Max ${z.maxFiles} attachments`, 'warn'); input.value = ''; return; }
  z.files.push(...incoming.slice(0, available));
  if (incoming.length > available) window.toast(`Only ${available} more attachment(s) allowed`, 'warn');
  input.value = '';
  _sfRenderAttachZone(id);
};

window._sfRemoveExisting = function(id, index) {
  const z = _sfAttachZones[id];
  if (!z) return;
  z.existingPaths.splice(index, 1);
  _sfRenderAttachZone(id);
};

window._sfRemoveStaged = function(id, index) {
  const z = _sfAttachZones[id];
  if (!z) return;
  z.files.splice(index, 1);
  _sfRenderAttachZone(id);
};

window.uploadAllAttachments = async function(id) {
  const z = _sfAttachZones[id];
  if (!z) return [];
  const uploaded = [...z.existingPaths];
  for (const file of [...z.files]) {
    const path = await window.uploadFile(z.bucket, file);
    uploaded.push(path);
    z.existingPaths.push(path);
  }
  z.files = [];
  return uploaded;
};

window.resetAttachmentZone = function(id) {
  delete _sfAttachZones[id];
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
};

window.getAttachmentState = function(id) {
  return _sfAttachZones[id] || { existingPaths: [], files: [] };
};

/**
 * Wrapper for Supabase queries that handles errors uniformly.
 * Usage:  const data = await safeQuery(sb.from('sales').select('*'));
 */
window.safeQuery = async function(promise, errorMessage) {
  const { data, error } = await promise;
  if (error) {
    console.error(errorMessage || 'Query failed:', error);
    window.toast(errorMessage || 'Something went wrong', 'err');
    throw error;
  }
  return data;
};

/**
 * Listen for auth state changes. If the session expires (or the user signs
 * out from another tab), we want to gracefully redirect to login instead of
 * leaving them on a dashboard that silently fails on every query.
 *
 * Skipped on login/signup/landing/forgot/reset pages — those shouldn't redirect
 * mid-flow.
 */
(function setupAuthListener() {
  const noRedirectPages = ['login.html', 'signup.html', 'landing.html', 'forgot-password.html', 'reset-password.html', 'index.html', ''];
  const path = location.pathname.split('/').pop() || '';
  if (noRedirectPages.includes(path)) return;

  window.sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      // Session is gone. Redirect, don't leave them in zombie state.
      // Save current URL so they can come back after re-login (future)
      try { sessionStorage.setItem('sf_post_login_redirect', location.pathname); } catch {}
      location.replace('login.html?expired=1');
    }
  });
})();

/**
 * Network/Supabase-unreachable detection. Wrap any fetch failure inside
 * supabase calls in a friendlier message.
 */
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    window.toast('Connection problem. Check your internet and try again.', 'err');
  }
});

// ============================================================================
// REALTIME — subscribe to tenant-scoped table changes and trigger refresh
// ============================================================================
//
// Usage in a dashboard:
//
//   window.subscribeRealtime({
//     tenantId: window.currentProfile.tenant_id,
//     tables: ['payments', 'rep_holdings', 'sales'],
//     onChange: () => { loadAll(); renderEverything(); }
//   });
//
// The onChange callback is debounced (350ms) so a flurry of changes triggers
// just one refresh. Channel is automatically cleaned up on page unload.
//
// Notes:
//   - Realtime delivers postgres_changes events. The free Supabase tier
//     allows ~200 concurrent connections per project — fine for our scale.
//   - Subscriptions are per-tenant; RLS ensures we only see our own tenant's
//     events. (This works because Realtime respects RLS on the publication.)
//   - If the connection drops, supabase-js auto-reconnects.
//
// IMPORTANT: For Realtime to work, the relevant tables must be in the
// `supabase_realtime` publication. Run the SQL patch
// `stockflow-schema-patch-realtime.sql` to add them.
// ============================================================================

window._sfRealtimeChannel = null;
window._sfRefreshTimer = null;

window.subscribeRealtime = function({ tenantId, tables, onChange }) {
  if (!tenantId || !Array.isArray(tables) || !onChange) {
    console.warn('subscribeRealtime: missing tenantId/tables/onChange');
    return;
  }
  // Clean up any prior channel for this page
  if (window._sfRealtimeChannel) {
    try { window.sb.removeChannel(window._sfRealtimeChannel); } catch {}
    window._sfRealtimeChannel = null;
  }

  // Debounced refresh — bursts of events trigger just one refresh
  const debouncedRefresh = () => {
    if (window._sfRefreshTimer) clearTimeout(window._sfRefreshTimer);
    window._sfRefreshTimer = setTimeout(() => {
      try { onChange(); }
      catch (err) { console.error('Realtime refresh failed:', err); }
    }, 350);
  };

  const channel = window.sb.channel('sf-tenant-' + tenantId);
  for (const table of tables) {
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
      debouncedRefresh
    );
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] subscribed to', tables.length, 'tables');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[Realtime] connection issue:', status);
    }
  });
  window._sfRealtimeChannel = channel;

  // Clean up on navigation
  window.addEventListener('beforeunload', () => {
    if (window._sfRealtimeChannel) {
      try { window.sb.removeChannel(window._sfRealtimeChannel); } catch {}
    }
  }, { once: true });
};

// ----------------------------------------------------------------------------
// Theme (light / dark) — shared by every page that loads this script.
// Persisted in localStorage('sf_theme') and reflected as <html data-theme="…">.
// A tiny inline snippet in each page's <head> applies the saved theme before
// first paint (no flash); this module exposes the toggle and syncs the controls.
// ----------------------------------------------------------------------------
window.applyTheme = function(theme) {
  var t = (theme === 'dark') ? 'dark' : 'light';
  try { document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  try { localStorage.setItem('sf_theme', t); } catch (e) {}
  var dark = (t === 'dark');
  document.querySelectorAll('.theme-btn').forEach(function(b) {
    b.textContent = dark ? '☀️' : '🌙';
    b.setAttribute('aria-pressed', String(dark));
    b.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  });
  var lbl = document.getElementById('themeLabel');
  if (lbl) lbl.textContent = dark ? 'Dark' : 'Light';
  try { window.dispatchEvent(new CustomEvent('sf:themechange', { detail: { theme: t } })); } catch (e) {}
};

window.setTheme = function(theme) { window.applyTheme(theme); };

window.toggleTheme = function() {
  var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  window.applyTheme(cur === 'dark' ? 'light' : 'dark');
};

// Once the DOM is ready, sync the toggle controls with the theme the inline
// <head> snippet already applied (covers pages where this loads after paint).
(function syncThemeControls() {
  function run() {
    var cur = document.documentElement.getAttribute('data-theme');
    if (cur !== 'light' && cur !== 'dark') {
      var saved = null;
      try { saved = localStorage.getItem('sf_theme'); } catch (e) {}
      cur = saved || ((window.matchMedia && matchMedia('(prefers-color-scheme:dark)').matches) ? 'dark' : 'light');
    }
    window.applyTheme(cur);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
