import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { downloadCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/money";
import { Money } from "@/components/Money";
import { useSettings } from "@/lib/settings";
import { DEPOSIT_STATUS_LABEL } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  component: AdminDeposits,
});

type Row = {
  id: string;
  reference: string;
  amount_minor: number;
  bank_reference: string;
  slip_path: string;
  user_note: string | null;
  status: string;
  flagged_duplicate: boolean;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile: { username: string; email: string | null } | null;
};

function AdminDeposits() {
  const { can } = useAuth();
  const { currency } = useSettings();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [active, setActive] = useState<Row | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin", "deposits", filter],
    queryFn: async () => {
      let q = supabase.from("deposits").select("*, profile:profiles(username, email)").order("created_at", { ascending: false }).limit(300);
      if (filter === "open") q = q.in("status", ["pending", "under_review"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  async function open(r: Row) {
    setActive(r);
    setNote("");
    setVerified(false);
    setSlipUrl(null);
    const { data } = await supabase.storage.from("payment-slips").createSignedUrl(r.slip_path, 300);
    setSlipUrl(data?.signedUrl ?? null);
  }

  async function decide(decision: "under_review" | "approve" | "reject") {
    if (!active) return;
    const { error } = await supabase.rpc("admin_review_deposit", { _id: active.id, _decision: decision, _note: note });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success(decision === "approve" ? "Deposit approved and credited" : decision === "reject" ? "Deposit rejected" : "Marked under review");
    setActive(null);
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-black uppercase">Deposits</h1>
        <div className="flex gap-2">
          <Button variant={filter === "open" ? "default" : "secondary"} size="sm" onClick={() => setFilter("open")}>Open</Button>
          <Button variant={filter === "all" ? "default" : "secondary"} size="sm" onClick={() => setFilter("all")}>All</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv("deposits.csv", (data ?? []).map((r) => ({
                reference: r.reference, user: r.profile?.username, amount: (r.amount_minor / 100).toFixed(2), bank_reference: r.bank_reference,
                status: r.status, duplicate: r.flagged_duplicate, created_at: r.created_at, reviewed_at: r.reviewed_at, note: r.review_note,
              })))
            }
          >
            Export CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Bank ref</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">No deposits.</td></tr>}
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{format(new Date(r.created_at), "d MMM HH:mm")}</td>
                <td className="px-3 py-2">{r.profile?.username}<span className="block text-xs text-muted-foreground">{r.profile?.email}</span></td>
                <td className="px-3 py-2 font-mono font-semibold"><Money minor={r.amount_minor} currency={currency} /></td>
                <td className="px-3 py-2 font-mono text-xs">{r.bank_reference}{r.flagged_duplicate && <span className="ml-1 font-sans font-semibold text-destructive">Duplicate ref</span>}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} label={DEPOSIT_STATUS_LABEL[r.status]} /></td>
                <td className="px-3 py-2 text-right"><Button size="sm" variant="secondary" onClick={() => open(r)}>Review</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Deposit {active?.reference}</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>User: <b>{active.profile?.username}</b></p>
                <p>Amount: <b className="font-mono"><Money minor={active.amount_minor} currency={currency} /></b></p>
                <p>Bank ref: <b className="font-mono">{active.bank_reference}</b></p>
                <p>Status: <StatusBadge status={active.status} /></p>
              </div>
              {active.flagged_duplicate && <p className="rounded bg-destructive/10 p-2 text-destructive">Another request uses this bank reference. Check for a reused slip.</p>}
              {active.user_note && <p className="text-muted-foreground">Customer note: {active.user_note}</p>}
              <div className="rounded border border-border bg-surface p-2">
                {slipUrl ? (
                  active.slip_path.endsWith(".pdf") ? (
                    <a href={slipUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open PDF slip</a>
                  ) : (
                    <img src={slipUrl} alt="Payment slip" className="max-h-80 w-full object-contain" />
                  )
                ) : <p className="text-muted-foreground">Loading slip…</p>}
              </div>
              {(active.status === "pending" || active.status === "under_review") && can("finance") ? (
                <>
                  <Textarea placeholder="Review note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={verified} onCheckedChange={(v) => setVerified(v === true)} />
                    I have matched this transfer against the bank statement (not just the slip).
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => decide("under_review")}>Mark under review</Button>
                    <Button variant="destructive" onClick={() => decide("reject")}>Reject</Button>
                    <Button disabled={!verified} onClick={() => decide("approve")}>Approve & credit</Button>
                  </div>
                </>
              ) : (
                active.review_note && <p className="text-muted-foreground">Review note: {active.review_note}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
