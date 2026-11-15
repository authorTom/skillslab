// Checks the defaults a production build bakes into the app (see
// src/data/provisioning.ts), called from vite.config.ts on `vite build`.
//
// A release build must enforce signatures: without VITE_SIGNING_PUBLIC_KEY an
// iPad that isn't given a key by its MDM would accept any package. The build
// fails unless SKILLSLAB_ALLOW_UNSIGNED_BUILD=1 says that is intended (for
// the simulator, or a fleet where every iPad gets the key from its MDM).

/** Problems with `env` for a release build; empty when it may go ahead. */
export function releaseDefaultProblems(env) {
  const problems = [];
  const key = (env.VITE_SIGNING_PUBLIC_KEY ?? "").trim();
  const allowUnsigned = env.SKILLSLAB_ALLOW_UNSIGNED_BUILD === "1";

  if (!key) {
    if (!allowUnsigned) {
      problems.push(
        "VITE_SIGNING_PUBLIC_KEY is not set, so this build would accept unsigned content packages. " +
          "Set it to the public key shown on the server's /admin/releases page, or set " +
          "SKILLSLAB_ALLOW_UNSIGNED_BUILD=1 if every iPad will get the key from its MDM."
      );
    }
  } else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key) || Buffer.from(key, "base64").length !== 32) {
    problems.push("VITE_SIGNING_PUBLIC_KEY isn't a base64 Ed25519 public key (32 bytes).");
  }

  const url = (env.VITE_SERVER_URL ?? "").trim();
  if (url) {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      // reported below
    }
    if (!parsed || parsed.protocol !== "https:") {
      problems.push(`VITE_SERVER_URL must be an https:// address, not "${url}".`);
    }
  }
  return problems;
}
