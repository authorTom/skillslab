import { canInstallFromFiles, ContentPackage, type ConnectionProblem } from "./contentPackage";

export const UNREACHABLE = "Could not reach the server.";

const MESSAGES: Record<ConnectionProblem, string> = {
  "untrusted-certificate":
    "This iPad doesn’t trust the server’s certificate. Install and trust the certificate of the authority that issued it (usually a profile from your IT team), then try again.",
  "certificate-date":
    "The server’s certificate has expired or isn’t valid yet. Check this iPad’s date and time, or ask whoever runs the server to renew it.",
  "secure-connection":
    "A secure connection to the server couldn’t be made. Its certificate may not meet iPad requirements.",
  "host-not-found":
    "The server’s address wasn’t found. Check it, and that this iPad is on the same network as the server.",
  "cannot-connect": "The server isn’t answering. Check it’s running, and that this iPad is on the right network.",
  "timed-out": "The server took too long to answer. Try again in a moment.",
  offline: "No network connection.",
  other: UNREACHABLE,
};

/** A message for a problem the native side diagnosed. */
export function connectionMessage(problem: ConnectionProblem | "none"): string {
  return problem === "none" ? UNREACHABLE : MESSAGES[problem];
}

/**
 * Explains why `url` couldn't be fetched. In the web view fetch() only says
 * "Load failed", so on a device the request is repeated natively, which can
 * tell a certificate the iPad doesn't trust from a server that isn't there.
 */
export async function explainFetchFailure(url: string): Promise<string> {
  if (!canInstallFromFiles()) return UNREACHABLE;
  try {
    const { problem } = await ContentPackage.diagnoseConnection({ url });
    return connectionMessage(problem);
  } catch {
    return UNREACHABLE;
  }
}
