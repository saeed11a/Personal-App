import React, { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/AuthContext";
import { AVATAR_TYPES, avatarFileError, saveAvatar } from "@/lib/profileApi";
import { useToast } from "@/components/ui/use-toast";

const initials = (user) => (user?.full_name || user?.email || "H").trim().charAt(0).toUpperCase();

// Only ever the signed-in account's own picture: the upload path is forced into that
// user's own storage folder and the database (set_own_avatar) writes only their row.
// An administrator changing *someone else's* picture or PIN is the Staff & access
// screen's job, not this dialog's.
export default function ProfilePictureDialog({ open, onOpenChange }) {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const objectUrl = useRef("");

  const releasePreview = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = "";
    }
  };

  // Start each visit from what is actually stored on the profile.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError("");
    releasePreview();
    setPreview(user?.avatar_url || "");
  }, [open, user?.avatar_url]);

  useEffect(() => releasePreview, []);

  const pick = (event) => {
    const chosen = event.target.files?.[0] || null;
    releasePreview();

    if (!chosen) {
      setFile(null);
      setError("");
      setPreview(user?.avatar_url || "");
      return;
    }

    const problem = avatarFileError(chosen);
    if (problem) {
      setFile(null);
      setError(problem);
      setPreview(user?.avatar_url || "");
      return;
    }

    objectUrl.current = URL.createObjectURL(chosen);
    setFile(chosen);
    setError("");
    setPreview(objectUrl.current);
  };

  const save = async () => {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAvatar(user?.id, file);
      await refreshProfile();
      toast({
        title: "Profile picture saved",
        description: "It is stored on your profile and shows every time you sign in.",
      });
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "The picture could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile picture</DialogTitle>
          <DialogDescription>
            PNG, JPEG, WEBP or GIF, up to 2 MB. Your picture is saved to your account, not to this device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border border-border">
            <AvatarImage src={preview || undefined} alt="" />
            <AvatarFallback className="bg-brand/10 text-2xl font-bold text-brand">{initials(user)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block">
              <span className="field-label">Choose an image</span>
              <input
                type="file"
                accept={AVATAR_TYPES.join(",")}
                onChange={pick}
                disabled={saving}
                className="mt-1 block w-full cursor-pointer rounded-md border border-input bg-background text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-secondary-foreground"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {user?.full_name || user?.email} · {file ? "new picture selected" : "current picture"}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !file}>
            <Camera className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save picture"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
