import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/*
 * Every Server Action is a public endpoint: anyone can POST to it. This
 * checks that each exported action in a "use server" file checks who is
 * calling before doing anything else, so a new action can't ship unguarded.
 */

const ROOT = path.join(__dirname, "..", "src");

/** Actions that are meant to be reachable without being signed in. */
const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction", "setupAction"]);

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return serverActionFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    return /^\s*["']use server["']/.test(fs.readFileSync(full, "utf8")) ? [full] : [];
  });
}

/** Each exported async function's name and the first statement of its body. */
function exportedActions(source: string): { name: string; firstStatement: string }[] {
  const found: { name: string; firstStatement: string }[] = [];
  const pattern = /export async function (\w+)\s*\(/g;
  for (let match; (match = pattern.exec(source)); ) {
    // Skip the parameter list (which may hold nested parentheses and types) to the body.
    let depth = 1;
    let i = pattern.lastIndex;
    while (depth > 0) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
      i++;
    }
    const body = source.indexOf("{", i);
    found.push({ name: match[1], firstStatement: source.slice(body + 1).trim().split("\n")[0] });
  }
  return found;
}

describe("server actions", () => {
  const files = serverActionFiles(ROOT);

  it("are found", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of files) {
    const relative = path.relative(ROOT, file);
    for (const { name, firstStatement } of exportedActions(fs.readFileSync(file, "utf8"))) {
      if (PUBLIC_ACTIONS.has(name)) continue;
      it(`${relative} › ${name} checks the caller first`, () => {
        expect(firstStatement).toMatch(/^(const \w+ = )?await require(User|Role)\(/);
      });
    }
  }
});
