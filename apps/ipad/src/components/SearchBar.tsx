import { useRef } from "react";
import { CloseIcon, SearchIcon } from "./icons";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className="relative"
      // The keyboard's Search key submits; results are already live, so just
      // dismiss the keyboard to reveal them.
      onSubmit={(e) => {
        e.preventDefault();
        input.current?.blur();
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search skills"
        aria-label="Search skills"
        enterKeyHint="search"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 w-full appearance-none rounded-xl bg-surface pl-11 pr-12 text-base text-ink shadow-card ring-1 ring-inset ring-line outline-none transition placeholder:text-ink-3 focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition active:opacity-50"
          aria-label="Clear search"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-3 text-surface">
            <CloseIcon className="h-3 w-3" />
          </span>
        </button>
      )}
    </form>
  );
}
