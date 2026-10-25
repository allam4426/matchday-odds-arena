import { createFileRoute } from "@tanstack/react-router";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help, Betting Rules & Terms | Pitchside" },
      { name: "description", content: "How deposits, withdrawals, bet acceptance and settlement work on Pitchside." },
      { property: "og:title", content: "Help & Rules | Pitchside" },
      { property: "og:description", content: "Deposits, withdrawals, bet acceptance and settlement rules." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

const FAQ = [
  {
    q: "How do bank-transfer deposits work?",
    a: "Transfer to the bank account shown on the Deposit page, then submit the amount, your transfer reference and a photo or PDF of the payment slip. Your request stays pending until our finance team matches it against the bank statement. Uploading a slip never credits your wallet by itself.",
  },
  {
    q: "How long do withdrawals take?",
    a: "When you request a withdrawal the amount is reserved from your balance. Finance reviews it, sends the transfer, and marks it Paid only after the bank confirms the payment. If a withdrawal is rejected or fails, the reserved amount is returned to your balance.",
  },
  {
    q: "When is a bet accepted?",
    a: "Only when the server confirms it. At that moment we re-check that the match and market are open and that the odds match what you saw. If odds moved, you'll be asked to accept the new price unless you've enabled automatic acceptance.",
  },
  {
    q: "Single vs combo bets",
    a: "A single is one selection with its own stake. A combo (accumulator) joins 2 or more selections from different matches; all must win, and the odds are multiplied together. A void leg counts as odds of 1.00.",
  },
  {
    q: "How are bets settled?",
    a: "Markets are settled on the official result after 90 minutes plus stoppage time, excluding extra time and penalties, unless the market says otherwise. Postponed, abandoned or cancelled matches are voided and stakes returned. Returns include your stake; net winnings are returns minus stake.",
  },
  {
    q: "Why is a market locked?",
    a: "Markets are suspended during key moments (goals, penalties, red cards), when a match kicks off for prematch markets, or when a trader is updating prices.",
  },
];

function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-black uppercase">Help & rules</h1>
        <p className="text-muted-foreground">Answers about payments, bets and settlement.</p>
      </div>
      <Accordion type="single" collapsible className="rounded-lg border border-border bg-card px-4">
        {FAQ.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <section id="terms" className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="text-lg font-bold text-foreground">Terms & privacy (summary)</h2>
        <p>
          Accounts are for one person aged 18+ residing in a permitted jurisdiction. Multiple accounts, using another
          person's payment method, or providing false details may lead to suspension and withheld funds pending review.
        </p>
        <p>
          We store the personal and financial information needed to run your account, verify your identity, prevent
          fraud and meet legal obligations. Payment slips and bank details are only visible to authorised finance staff.
        </p>
        <p className="text-xs">The operator must replace this summary with its full licensed terms before launch.</p>
      </section>
    </div>
  );
}
