import React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The row controls every module's table shares, in the same order: view, edit,
// delete. A module that has no dialog for one of them simply does not pass the
// callback and the button disappears.
export default function RowActions({ onView, onEdit, onDelete, extra }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onView && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="View details"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
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
