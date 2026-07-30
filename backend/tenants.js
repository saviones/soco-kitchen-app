/* ============================================================
   Tenant registry (Worker side)
   ------------------------------------------------------------
   Data lives in tenants.json so the Python dev server reads the
   exact same registry — one file, no drift between the two
   backends. This module only adds lookup helpers.
   ============================================================ */

import registry from "./tenants.json";

export const TENANTS = registry.tenants;

export function getTenant(id) {
  return Object.prototype.hasOwnProperty.call(TENANTS, id) ? TENANTS[id] : null;
}

/* Resolve a tenant's Toast credentials out of the worker env. */
export function tenantCredentials(tenant, env) {
  const clientId = env[tenant.secrets.clientId];
  const clientSecret = env[tenant.secrets.clientSecret];
  if (!clientId || !clientSecret) {
    throw new Error(`missing Toast credentials for tenant "${tenant.id}" ` +
      `(expected env ${tenant.secrets.clientId} / ${tenant.secrets.clientSecret})`);
  }
  return { clientId, clientSecret };
}

export function staffToken(tenant, env) {
  return env[tenant.secrets.staffToken] || null;
}

export function adminToken(tenant, env) {
  return env[tenant.secrets.adminToken] || null;
}

export function rewardById(tenant, rewardId) {
  return (tenant.rewards || []).find(r => r.id === rewardId) || null;
}
