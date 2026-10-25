import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, HandHeart, Hourglass, ShieldOff, Wallet } from "lucide-react";

export const Route = createFileRoute("/responsible-gambling")({
  head: () => ({
    meta: [
      { title: "Responsible Gambling Tools | Pitchside" },
      {
        name: "description",
        content: "Deposit and stake limits, reality checks, cooling-off breaks and self-exclusion to keep betting fun.",
      },
      { property: "og:title", content: "Responsible Gambling | Pitchside" },
      { property: "og:description", content: "Limits, reality checks, breaks and self-exclusion." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RGPage,
});

const TOOLS = [
  { icon: Wallet, title: "Deposit & stake limits", body: "Cap how much you can deposit per day or week, and how much you can stake per day. Lowering a limit is instant; raising one waits 24 hours." },
  { icon: Clock, title: "Reality checks", body: "Get a reminder showing how long you've been logged in, at an interval you choose." },
  { icon: Hourglass, title: "Take a break", body: "Pause betting and deposits for 24 hours up to 30 days. Breaks can't be cancelled early." },
  { icon: ShieldOff, title: "Self-exclusion", body: "Block betting and deposits for 6 months, 1 year or 5 years. You can still withdraw your balance." },
];

function RGPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-success">Safer gambling</p>
        <h1 className="font-display text-4xl font-black uppercase">Stay in control</h1>
        <p className="mt-2 text-muted-foreground">
          Betting should be entertainment, never a way to make money or escape problems. You must be 18 or older and
          live in a jurisdiction where online betting is permitted.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <div key={t.title} className="rounded-lg border border-border bg-card p-4">
            <t.icon className="h-5 w-5 text-primary" />
            <h2 className="mt-2 text-lg font-bold">{t.title}</h2>
            <p className="text-sm text-muted-foreground">{t.body}</p>
          </div>
        ))}
      </div>
      <Link
        to="/account"
        className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-bold uppercase text-primary-foreground"
      >
        Manage my limits
      </Link>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <HandHeart className="h-5 w-5 text-success" /> Warning signs
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Spending more money or time than you intended</li>
          <li>Chasing losses or borrowing money to bet</li>
          <li>Hiding your betting from family or friends</li>
          <li>Feeling anxious or irritable when not betting</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          If any of these sound familiar, use the tools above and reach out to a free, confidential gambling support
          service in your country.
        </p>
      </div>
    </div>
  );
}
