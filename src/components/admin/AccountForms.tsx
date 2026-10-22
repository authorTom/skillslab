"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import type { UserActionState } from "@/app/admin/users/actions";
import { inputClass, primaryButtonClass } from "./formStyles";

type Action<S> = (prev: S, formData: FormData) => Promise<S>;

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={input.id} className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input {...input} name={input.name ?? input.id} className={inputClass} />
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

function SubmitButton({ children, pending: pendingLabel }: { children: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${primaryButtonClass} w-full`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function Messages({ state }: { state: { error?: string; success?: string } }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{state.success}</p>
      )}
    </>
  );
}

const PASSWORD_HINT = "At least 12 characters. A few unrelated words make a strong, memorable password.";

export function LoginForm({ action }: { action: Action<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Username" id="username" autoComplete="username" required autoFocus />
      <Field label="Password" id="password" type="password" autoComplete="current-password" required />
      <Messages state={state} />
      <SubmitButton pending="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function SetupForm({ action }: { action: Action<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field
        label="Setup code"
        id="code"
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        hint="Printed in the server log when it started."
      />
      <Field label="Your name" id="name" autoComplete="name" required />
      <Field
        label="Username"
        id="username"
        autoComplete="username"
        required
        hint="3–32 characters: letters, numbers, dots, dashes and underscores."
      />
      <Field
        label="Password"
        id="password"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
      />
      <Field label="Confirm password" id="confirm" type="password" autoComplete="new-password" required />
      <Messages state={state} />
      <SubmitButton pending="Creating…">Create administrator</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm({
  action,
  currentLabel = "Current password",
}: {
  action: Action<ActionState>;
  currentLabel?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    // Remounting on success clears the fields.
    <form key={state.success} action={formAction} className="space-y-4">
      <Field label={currentLabel} id="current" type="password" autoComplete="current-password" required />
      <Field
        label="New password"
        id="password"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
      />
      <Field label="Confirm new password" id="confirm" type="password" autoComplete="new-password" required />
      <Messages state={state} />
      <SubmitButton pending="Saving…">Change password</SubmitButton>
    </form>
  );
}

/** Shows a temporary password once, with a button to copy it. */
function TemporaryPassword({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">Temporary password for {username}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-base tracking-wide text-stone-900 ring-1 ring-amber-200">
          {password}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(password);
            setCopied(true);
          }}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium transition hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-800">
        Give this to them directly. It won’t be shown again, and they’ll choose their own password
        when they first sign in.
      </p>
    </div>
  );
}

export function NewUserForm({
  action,
  roles,
}: {
  action: Action<UserActionState>;
  roles: { value: string; label: string; description: string }[];
}) {
  const [state, formAction] = useActionState(action, {});

  if (state.temporaryPassword && state.username) {
    return (
      <div className="space-y-4">
        <TemporaryPassword username={state.username} password={state.temporaryPassword} />
        <div className="flex flex-wrap gap-3">
          <Link href={`/admin/users/${state.userId}`} className={primaryButtonClass}>
            View account
          </Link>
          <Link
            href="/admin/users"
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Name" id="name" autoComplete="off" required autoFocus />
      <Field
        label="Username"
        id="username"
        autoComplete="off"
        required
        spellCheck={false}
        hint="What they sign in with. 3–32 characters: letters, numbers, dots, dashes and underscores."
      />
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-stone-700">Role</legend>
        <div className="space-y-2">
          {roles.map((role, i) => (
            <label
              key={role.value}
              className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 p-3 text-sm has-[:checked]:border-teal-400 has-[:checked]:bg-teal-50/50"
            >
              <input
                type="radio"
                name="role"
                value={role.value}
                defaultChecked={i === roles.length - 1}
                className="mt-0.5 accent-teal-600"
              />
              <span>
                <span className="font-medium text-stone-800">{role.label}</span>
                <span className="block text-stone-500">{role.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-stone-400">
        A temporary password is generated for you to pass on. They must replace it when they first
        sign in.
      </p>
      <Messages state={state} />
      <div className="w-full sm:w-48">
        <SubmitButton pending="Creating…">Create user</SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordForm({
  action,
  name,
}: {
  action: Action<UserActionState>;
  name: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <div className="space-y-3">
      {state.temporaryPassword && state.username && (
        <TemporaryPassword username={state.username} password={state.temporaryPassword} />
      )}
      <Messages state={state} />
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `Reset ${name}’s password? They’ll be signed out everywhere and need the new temporary password to sign in.`
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <button className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300">
          {state.temporaryPassword ? "Generate another" : "Reset password"}
        </button>
      </form>
    </div>
  );
}
