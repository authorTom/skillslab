"use client";

import { useState } from "react";

/** The release signing public key, with a button to copy it. */
export default function PublicKeyField({ publicKey }: { publicKey: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <code className="min-w-0 break-all rounded-lg bg-white px-3 py-1.5 font-mono text-sm text-stone-900 ring-1 ring-stone-200">
        {publicKey}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(publicKey);
          setCopied(true);
        }}
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-teal-300"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
