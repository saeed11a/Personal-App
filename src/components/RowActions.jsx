import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RowActions({ onEdit, onDelete, extra }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
