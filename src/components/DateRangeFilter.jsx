import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DateRangeFilter({ from, to, onFrom, onTo, extra }) {
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <label className="space-y-1">
        <span className="field-label">From</span>
        <Input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className="w-[150px]" />
      </label>
      <label className="space-y-1">
        <span className="field-label">To</span>
        <Input type="date" value={to} onChange={(event) => onTo(event.target.value)} className="w-[150px]" />
      </label>
      {extra}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onFrom("");
          onTo("");
        }}
      >
        Clear
      </Button>
    </div>
  );
}
