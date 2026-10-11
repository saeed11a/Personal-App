import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ChevronDown, KeyRound, LogOut, UserRoundCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/AuthContext";
import { usesSupabaseAuth } from "@/lib/authMode";
import { departmentLabel, roleLabel } from "@/lib/permissions";
import ProfilePictureDialog from "@/components/profile/ProfilePictureDialog";

const initials = (user) => (user?.full_name || user?.email || "H").trim().charAt(0).toUpperCase();

// The account menu: who is signed in, and the four things that account may do to
// itself. Everything here acts on the signed-in user only — the PIN screens and
// set_own_avatar are bound to auth.uid() server-side, so this menu can never reach
// another employee's PIN, picture or credentials.
export default function ProfileMenu() {
  const { user, logout, pinEnabled } = useAuth();
  const navigate = useNavigate();
  const [pictureOpen, setPictureOpen] = useState(false);

  // "Switch user" and "Sign out" end the session the same way — the app has no
  // second identity mode, so both terminate it and return to the login screen for
  // whoever signs in next. Neither one ever just swaps a displayed name.
  const endSession = () => logout();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Account menu"
            className="h-9 shrink-0 gap-1 rounded-full border border-border bg-card py-1 pl-1 pr-1.5 hover:bg-accent"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.avatar_url || undefined} alt="" />
              <AvatarFallback className="bg-brand/10 text-xs font-bold text-brand">{initials(user)}</AvatarFallback>
            </Avatar>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11 border border-border">
                <AvatarImage src={user?.avatar_url || undefined} alt="" />
                <AvatarFallback className="bg-brand/10 text-sm font-bold text-brand">{initials(user)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-bold">{user?.full_name || "Factory User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email || "—"}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="truncate text-right font-semibold">{roleLabel(user?.role) || "—"}</dd>
              <dt className="text-muted-foreground">Department</dt>
              <dd className="truncate text-right font-semibold">{departmentLabel(user?.department) || "Not set"}</dd>
            </dl>
          </DropdownMenuLabel>

          {usesSupabaseAuth && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(pinEnabled ? "/change-pin" : "/setup-pin")}>
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                {pinEnabled ? "Change PIN" : "Set up PIN"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPictureOpen(true)}>
                <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                Change profile picture
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={endSession}>
            <UserRoundCog className="mr-2 h-4 w-4" aria-hidden="true" />
            Switch user
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={endSession} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfilePictureDialog open={pictureOpen} onOpenChange={setPictureOpen} />
    </>
  );
}
