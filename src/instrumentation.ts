/**
 * Runs once when the server starts, before it takes requests: tidies expired
 * sessions and old audit entries, and makes sure an administrator can sign in
 * (printing a setup code to the log if nobody can).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startup } = await import("./lib/bootstrap");
  await startup();
}
