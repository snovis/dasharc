import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';

let CONFIG = null;

export function loadConfig(path = process.env.ACCOUNTS_CONFIG_PATH) {
  const resolvedPath = path
    ? resolve(path)
    : resolve(process.cwd(), 'config/accounts.local.yaml');

  let raw;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read accounts config at ${resolvedPath}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = yaml.parse(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${resolvedPath}: ${err.message}`);
  }

  const accounts = parsed?.accounts ?? {};
  const users = parsed?.users ?? [];

  // Normalize: emails lowercased, account IDs validated, agent IDs collected.
  const allAccountIds = Object.keys(accounts);
  const normalizedUsers = users.map((u) => {
    if (!u.email) throw new Error(`User missing email: ${JSON.stringify(u)}`);
    const email = String(u.email).toLowerCase();
    const userAccounts = Array.isArray(u.accounts) ? u.accounts : [];
    const isWildcard = userAccounts.includes('*');
    const resolvedAccounts = isWildcard
      ? allAccountIds
      : userAccounts.filter((id) => {
          if (!accounts[id]) {
            console.warn(`User ${email} references unknown account "${id}" — ignoring`);
            return false;
          }
          return true;
        });
    return {
      email,
      accounts: resolvedAccounts,
      role: u.role || null,
      isWildcard,
    };
  });

  // Build fast lookup: email → user record.
  const userByEmail = new Map(normalizedUsers.map((u) => [u.email, u]));

  CONFIG = {
    accounts,
    accountIds: allAccountIds,
    users: normalizedUsers,
    userByEmail,
    sourcePath: resolvedPath,
  };

  return CONFIG;
}

export function getConfig() {
  if (!CONFIG) throw new Error('Config not loaded. Call loadConfig() first.');
  return CONFIG;
}

/**
 * Given an email, return the user's resolved access:
 *   {
 *     email, role, isWildcard,
 *     accounts: [{ id, name, branding, agents: [{id, name}], demo_trigger_url }],
 *     agentIds: Set<string>,                  // every agent the user can see
 *     accountByAgentId: Map<string, string>,  // agent ID → owning account ID
 *   }
 *
 * Returns null if the email is not in the user list (caller should 403).
 */
export function resolveUserAccess(email) {
  const cfg = getConfig();
  const user = cfg.userByEmail.get(email.toLowerCase());
  if (!user) return null;

  const accounts = user.accounts.map((id) => {
    const acct = cfg.accounts[id];
    return {
      id,
      name: acct.name,
      branding: acct.branding ?? {},
      agents: (acct.agents ?? []).map((a) => ({ id: a.id, name: a.name })),
      demo_trigger_url: acct.demo_trigger_url ?? null,
    };
  });

  const agentIds = new Set();
  const accountByAgentId = new Map();
  for (const acct of accounts) {
    for (const agent of acct.agents) {
      agentIds.add(agent.id);
      accountByAgentId.set(agent.id, acct.id);
    }
  }

  return {
    email: user.email,
    role: user.role,
    isWildcard: user.isWildcard,
    accounts,
    agentIds,
    accountByAgentId,
  };
}
