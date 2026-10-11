import React, { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function TagInput({ value = [], onChange, placeholder, suggestions = [] }) {
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((part) => {
      if (!next.some((existing) => existing.toLowerCase() === part.toLowerCase())) next.push(part);
    });
    onChange(next);
    setDraft("");
  };

  const remove = (tag) => onChange(value.filter((item) => item !== tag));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
          >
            {tag}
            <button type="button" onClick={() => remove(tag)} aria-label={`Remove ${tag}`}>
              <X className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={placeholder}
        className="h-10"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((option) => !value.some((existing) => existing.toLowerCase() === option.toLowerCase()))
            .map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => add(option)}
                className={cn(
                  "rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors",
                  "hover:border-brand hover:text-brand"
                )}
              >
                + {option}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
