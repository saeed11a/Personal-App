import React from "react";
import { Delete, Loader2 } from "lucide-react";

export const PIN_LENGTH = 5;

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// The five indicator dots. They only ever show how many digits have been typed —
// the digits themselves stay in component state until the server has judged them.
export function PinDots({ length, total = PIN_LENGTH }) {
  return (
    <div className="mb-8 flex justify-center gap-3" aria-label="PIN entry progress">
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          data-filled={index < length ? "true" : "false"}
          className={
            "h-3.5 w-3.5 rounded-full border transition-colors " +
            (index < length ? "border-brand bg-brand" : "border-border bg-transparent")
          }
        />
      ))}
    </div>
  );
}

function KeypadButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 items-center justify-center rounded-2xl border border-border bg-card text-xl font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// Shared keypad for the unlock, first-time setup and change-PIN screens.
export default function PinKeypad({ onDigit, onBackspace, disabled, busy, canBackspace = true }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {DIGITS.map((digit) => (
        <KeypadButton key={digit} label={digit} onClick={() => onDigit(digit)} disabled={disabled}>
          {digit}
        </KeypadButton>
      ))}
      <span aria-hidden="true" />
      <KeypadButton label="0" onClick={() => onDigit("0")} disabled={disabled}>
        0
      </KeypadButton>
      <KeypadButton label="Delete" onClick={onBackspace} disabled={disabled || !canBackspace}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Delete className="h-5 w-5" aria-hidden="true" />}
      </KeypadButton>
    </div>
  );
}
