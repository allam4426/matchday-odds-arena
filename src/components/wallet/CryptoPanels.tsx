import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ChevronLeft, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { parseRpcError } from "@/lib/betting";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { type CryptoWallet, cryptoToMinor, minorToCrypto, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export function CoinBadge({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-black text-primary",
        className,
      )}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

export function CoinRow({
  wallet,
  onClick,
  disabled,
  hint,
}: {
  wallet: Pick<CryptoWallet, "name" | "symbol" | "network">;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border"
    >
      <CoinBadge symbol={wallet.symbol} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">
          {wallet.symbol} <span className="font-normal text-muted-foreground">{wallet.name}</span>
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">{wallet.network}</span>
    </button>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Back">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

/** Coin list, then the deposit address + QR + TXID form for the chosen coin. */
export function CryptoDeposit({ wallets }: { wallets: CryptoWallet[] }) {
  const { user } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [walletId, setWalletId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const wallet = wallets.find((w) => w.id === walletId) ?? null;

  if (wallets.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Crypto deposits are not available yet.</p>;
  }

  if (!wallet) {
    return (
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Choose a cryptocurrency</h2>
        {wallets.map((w) => (
          <CoinRow key={w.id} wallet={w} onClick={() => setWalletId(w.id)} hint={`1 ${w.symbol} = ${formatMoney(w.mvr_rate * 100, settings.currency)}`} />
        ))}
      </section>
    );
  }

  const coins = Number(amount);
  const valid = Number.isFinite(coins) && coins > 0;
  const creditMinor = valid ? cryptoToMinor(coins, wallet.mvr_rate) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    if (!valid) return toast.error(`Enter the ${wallet.symbol} amount you sent.`);
    if (coins < wallet.min_amount) return toast.error(`Minimum deposit is ${wallet.min_amount} ${wallet.symbol}.`);
    if (txid.trim().length < 8) return toast.error("Enter the transaction hash (TXID).");
    if (file && file.size > 10 * 1024 * 1024) return toast.error("The screenshot must be under 10 MB.");
    setBusy(true);
    try {
      let path = "";
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("payment-slips").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("submit_crypto_deposit", {
        _wallet_id: wallet.id,
        _crypto_amount: coins,
        _txid: txid.trim(),
        _slip_path: path,
      });
      if (error) throw error;
      toast.success("Crypto deposit submitted", { description: "We'll credit your wallet once the transfer is confirmed." });
      setAmount("");
      setTxid("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    } catch (err) {
      toast.error("Deposit not submitted", { description: parseRpcError(err).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <BackHeader title="Deposit" onBack={() => setWalletId(null)} />
      <div className="flex items-center gap-3">
        <CoinBadge symbol={wallet.symbol} />
        <div>
          <p className="font-bold">
            {wallet.symbol} <span className="font-normal text-muted-foreground">{wallet.name}</span>
          </p>
          <p className="font-mono text-xs uppercase text-muted-foreground">{wallet.network}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-md bg-warning/15 p-2.5 text-xs font-semibold text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Min: {wallet.min_amount} {wallet.symbol}. Send only {wallet.symbol} on the {wallet.network} network to this address.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-1.5">
          <Label>Wallet address</Label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-2">
            <span className="min-w-0 flex-1 break-all font-mono text-xs">{wallet.address}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={() => {
                navigator.clipboard.writeText(wallet.address);
                toast.success("Address copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rate: 1 {wallet.symbol} = {formatMoney(wallet.mvr_rate * 100, settings.currency)}. Your wallet is credited in {settings.currency}.
          </p>
        </div>
        <div className="mx-auto rounded-lg bg-foreground p-3">
          <QRCodeSVG value={wallet.address} size={148} aria-label={`${wallet.symbol} address QR code`} />
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="cd-amount">Amount sent ({wallet.symbol})</Label>
          <Input id="cd-amount" inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {valid && (
            <p className="text-[11px] text-muted-foreground">
              {coins} {wallet.symbol} ≈ <b className="text-foreground">{formatMoney(creditMinor, settings.currency)}</b>
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cd-txid">Transaction hash (TXID)</Label>
          <Input id="cd-txid" className="font-mono" maxLength={120} value={txid} onChange={(e) => setTxid(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cd-shot">Screenshot (optional)</Label>
          <Input id="cd-shot" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
          {busy ? "Submitting…" : "Submit deposit"}
        </Button>
      </form>
    </div>
  );
}

/** Crypto withdrawal form for a chosen coin. Amount is in MVR, coin amount is shown. */
export function CryptoWithdrawForm({
  wallet,
  availableMinor,
  onBack,
}: {
  wallet: CryptoWallet;
  availableMinor: number;
  onBack: () => void;
}) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const minor = parseMoneyToMinor(amount) ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (address.trim().length < 20) return toast.error("Enter a valid wallet address.");
    if (!minor) return toast.error("Enter a valid amount.");
    if (minor > availableMinor) return toast.error("Amount exceeds your available balance.");
    setBusy(true);
    const { error } = await supabase.rpc("request_crypto_withdrawal", {
      _wallet_id: wallet.id,
      _amount_minor: minor,
      _address: address.trim(),
    });
    setBusy(false);
    if (error) return toast.error("Withdrawal not requested", { description: parseRpcError(error).message });
    toast.success("Withdrawal requested", { description: "The amount is reserved while we review your request." });
    setAmount("");
    queryClient.invalidateQueries({ queryKey: ["wallet"] });
    onBack();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <BackHeader title="Withdrawal" onBack={onBack} />
      <div className="flex items-center gap-3">
        <CoinBadge symbol={wallet.symbol} />
        <p className="font-bold">
          {wallet.symbol} <span className="font-normal text-muted-foreground">{wallet.name}</span>
        </p>
        <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">{wallet.network}</span>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cw-address">Wallet address *</Label>
        <Input id="cw-address" className="font-mono" maxLength={120} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`${wallet.network} address`} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cw-amount">Amount ({settings.currency}) *</Label>
        <Input id="cw-amount" inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">
          You receive ≈ <b className="text-foreground">{minorToCrypto(minor, wallet.mvr_rate)} {wallet.symbol}</b> (1 {wallet.symbol} ={" "}
          {formatMoney(wallet.mvr_rate * 100, settings.currency)}) · Available {formatMoney(availableMinor, settings.currency)}
        </p>
      </div>
      <p className="flex items-center gap-2 rounded-md bg-warning/15 p-2.5 text-xs font-semibold text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> You can withdraw {settings.max_withdrawals_per_day ?? 2} times per day.
      </p>
      <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
        {busy ? "Requesting…" : "Start process"}
      </Button>
    </form>
  );
}
