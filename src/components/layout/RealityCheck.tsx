import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const START_KEY = "pitchside.session-start";

/** Periodic session reminder ("reality check") based on the user's chosen interval. */
export function RealityCheck() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);

  const { data: limits } = useQuery({
    queryKey: ["rg-limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rg_limits").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const interval = limits?.session_reminder_minutes ?? 60;

  useEffect(() => {
    if (!user || !interval) return;
    let start = Number(sessionStorage.getItem(START_KEY));
    if (!start) {
      start = Date.now();
      sessionStorage.setItem(START_KEY, String(start));
    }
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 60000);
      if (elapsed > 0 && elapsed % interval === 0) {
        setMinutes(elapsed);
        setOpen(true);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [user, interval]);

  if (!user) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reality check</AlertDialogTitle>
          <AlertDialogDescription>
            You have been logged in for {minutes} minutes. Review your activity in My Bets and your wallet history.
            Remember to take regular breaks.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Link to="/account">Set limits or take a break</Link>
          </AlertDialogCancel>
          <AlertDialogCancel onClick={() => signOut()}>Log out</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
