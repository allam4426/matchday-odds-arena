import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { downloadCsv } from "@/lib/csv";
import { formatMoney, maskAccount } from "@/lib/money";
import { Money } from "@/components/Money";
import { useSettings } from "@/lib/settings";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  component: AdminWithdrawals,
});

type WStatus = "approved" | "processing" | "paid" | "rejected" | "failed";
const NEXT: Record<string, WStatus[]> = {
  requested: ["approved", "rejected"],
  pending_review: ["approved", "rejected"],
  approved: ["processing", "rejected"],
  processing: ["paid", "failed"],
};

type Row = {
  id: string; reference: string; amount_minor: number; bank_name: string; account_name: string; account_number: string;
  status: string; payment_reference: string | null; review_note: string | null; created_at: string;
  profile: { username: string; full_name: string } | null;
};

function AdminWithdrawals() {
  const { can } = useAuth();
  const { currency } = useSettings();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [active, setActive] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [payRef, setPayRef] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "withdrawals", filter],
    queryFn: async () => {
      let q = supabase.from("withdrawals").select("*, profile:profiles(username, full_name)").order("created_at", { ascending: false }).limit(300);
      if (filter === "open") q = q.in("status", ["requested", "pending_review", "approved", "processing"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  async function move(status: WStatus) {
    if (!active) return;
    const { error } = await supabase.rpc("admin_update_withdrawal", { _id: active.id, _status: status, _payment_reference: payRef, _note: note });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success(`Withdrawal ${status}`);
    setActive(null);
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-black uppercase">Withdrawals</h1>
        <div className="flex gap-2">
          <Button variant={filter === "open" ? "default" : "secondary"} size="sm" onClick={() => setFilter("open")}>Open</Button>
          <Button variant={filter === "all" ? "default" : "secondary"} size="sm" onClick={() => setFilter("all")}>All</Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv("withdrawals.csv", (data ?? []).map((r) => ({
            reference: r.reference, user: r.profile?.username, amount: (r.amount_minor / 100).toFixed(2), bank: r.bank_name,
            account: maskAccount(r.account_number), status: r.status, payment_reference: r.payment_reference, created_at: r.created_at,
          })))}>Export CSV</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Bank</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">No withdrawals.</td></tr>}
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{format(new Date(r.created_at), "d MMM HH:mm")}</td>
                <td className="px-3 py-2">{r.profile?.username}</td>
                <td className="px-3 py-2 font-mono font-semibold"><Money minor={r.amount_minor} currency={currency} /></td>
                <td className="px-3 py-2 text-xs">{r.bank_name} {maskAccount(r.account_number)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} label={WITHDRAWAL_STATUS_LABEL[r.status]} /></td>
                <td className="px-3 py-2 text-right"><Button size="sm" variant="secondary" onClick={() => { setActive(r); setNote(""); setPayRef(""); }}>Review</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdrawal {active?.reference}</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>User: <b>{active.profile?.username}</b></p>
                <p>Amount: <b className="font-mono"><Money minor={active.amount_minor} currency={currency} /></b></p>
                <p>Legal name: <b>{active.profile?.full_name}</b></p>
                <p>Status: <StatusBadge status={active.status} /></p>
              </div>
              <div className="rounded border border-border bg-surface p-2 font-mono text-xs">
                {active.bank_name} · {active.account_name} · {active.account_number}
              </div>
              {active.account_name.trim().toLowerCase() !== (active.profile?.full_name ?? "").trim().toLowerCase() && (
                <p className="text-xs text-warning">Account holder name differs from the customer's legal name.</p>
              )}
              {NEXT[active.status] && can("finance") ? (
                <>
                  <Textarea placeholder="Note (required to reject or fail)" value={note} onChange={(e) => setNote(e.target.value)} />
                  {active.status === "processing" && (
                    <Input placeholder="Bank payment confirmation reference" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {NEXT[active.status].map((s) => (
                      <Button key={s} variant={s === "rejected" || s === "failed" ? "destructive" : "default"} onClick={() => move(s)}>
                        {s === "paid" ? "Mark paid" : s.charAt(0).toUpperCase() + s.slice(1).replace("ed", "e").replace("Processing", "Mark processing")}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">{active.payment_reference ? `Payment ref ${active.payment_reference}` : active.review_note}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
