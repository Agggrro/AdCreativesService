/**
 * Check the latest Vercel deployment for this project via the REST API — no
 * CLI, so it works headless (the CLI's `vercel login` needs an interactive
 * browser flow this environment can't do).
 *
 *   node --env-file=.env.local scripts/deploy-status.mjs
 *   node --env-file=.env.local scripts/deploy-status.mjs --watch   # poll until settled
 *
 * Needs VERCEL_TOKEN. If the project lives under a team (not a personal
 * account), also set VERCEL_TEAM_ID — the script's own error message tells
 * you how to find it if the plain lookup fails.
 */
const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error(
    "VERCEL_TOKEN is not set.\n" +
      "vercel.com/account/tokens -> Create Token -> add it to .env.local as VERCEL_TOKEN.",
  );
  process.exit(1);
}

const PROJECT = process.env.VERCEL_PROJECT || "ad-creatives-service";
const TEAM_ID = process.env.VERCEL_TEAM_ID;
const watch = process.argv.includes("--watch");

const auth = { Authorization: `Bearer ${TOKEN}` };
const qs = (params) => {
  const p = new URLSearchParams(params);
  if (TEAM_ID) p.set("teamId", TEAM_ID);
  return p.toString();
};

async function api(path, params = {}) {
  const res = await fetch(`https://api.vercel.com${path}?${qs(params)}`, {
    headers: auth,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function findProjectId() {
  try {
    const p = await api(`/v9/projects/${encodeURIComponent(PROJECT)}`);
    return p.id;
  } catch (err) {
    console.error(`Could not look up project "${PROJECT}": ${err.message}`);
    if (!TEAM_ID) {
      console.error(
        "\nIf this project lives under a team, not your personal account, that lookup " +
          "fails with a plain token. Find the team id with:\n" +
          `  curl -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/teams\n` +
          "then set VERCEL_TEAM_ID in .env.local.",
      );
    }
    throw err;
  }
}

async function latestDeployment(projectId) {
  const { deployments } = await api("/v6/deployments", {
    projectId,
    target: "production",
    limit: "1",
  });
  return deployments[0];
}

function summarize(d) {
  const age = Math.round((Date.now() - d.created) / 1000);
  return `${d.readyState.padEnd(10)} ${d.url}  (commit ${d.meta?.githubCommitSha?.slice(0, 7) ?? "?"}, ${age}s ago)`;
}

const SETTLED = new Set(["READY", "ERROR", "CANCELED"]);

const projectId = await findProjectId();

if (!watch) {
  const d = await latestDeployment(projectId);
  console.log(summarize(d));
  process.exit(d.readyState === "ERROR" ? 1 : 0);
}

console.log(`watching ${PROJECT}'s latest production deployment...`);
for (;;) {
  const d = await latestDeployment(projectId);
  console.log(summarize(d));
  if (SETTLED.has(d.readyState)) {
    process.exit(d.readyState === "READY" ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
