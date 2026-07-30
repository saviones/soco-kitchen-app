/* ============================================================
   Tenant registry (Worker side)
   ------------------------------------------------------------
   Data lives in tenants.json so the Python dev server reads the
   exact same registry — one file, no drift between the two
   backends. This module only adds lookup helpers.
   ============================================================ */

import registryRaw from "./tenants.json";

/* Bundlers disagree about what a JSON import yields — a parsed object, a
   string, or raw bytes, depending on module rules and build settings. Getting
   this wrong is not a loud failure: TENANTS ends up undefined and the first
   tenant lookup throws a bare 500 with no useful message. Normalise all three
   shapes so the deployed worker cannot depend on which bundler ran. */
function normalizeRegistry(raw) {
  if (raw == null) throw new Error("tenants.json did not load");
  if (typeof raw === "string") return JSON.parse(raw);
  if (raw instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(raw));
  if (ArrayBuffer.isView(raw)) return JSON.parse(new TextDecoder().decode(raw.buffer));
  return raw;
}

const registry = normalizeRegistry(registryRaw);

if (!registry.tenants || typeof registry.tenants !== "object") {
  throw new Error("tenants.json loaded but has no `tenants` object");
}

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
