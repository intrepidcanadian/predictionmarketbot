export default function PositionsPage() {
  const stub = [
    { market: "Will Trump win 2028?", side: "YES", shares: 100, avgEntry: 0.48, currentPrice: 0.53, unrealised: 5.0 },
    { market: "BTC above $100k by Dec 2026?", side: "NO", shares: 50, avgEntry: 0.35, currentPrice: 0.28, unrealised: 3.5 },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Positions &amp; PnL</h1>
        <p className="text-sm text-muted-foreground">
          Stub data — live positions require the CLOB trading path to be wired up.
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Market</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Side</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Shares</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Avg Entry</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Current</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Unrealised PnL</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stub.map((pos, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{pos.market}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    pos.side === "YES"
                      ? "bg-green-500/10 text-green-700"
                      : "bg-red-400/10 text-red-600"
                  }`}>
                    {pos.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{pos.shares}</td>
                <td className="px-4 py-3 text-right font-mono">{Math.round(pos.avgEntry * 100)}¢</td>
                <td className="px-4 py-3 text-right font-mono">{Math.round(pos.currentPrice * 100)}¢</td>
                <td className={`px-4 py-3 text-right font-mono font-semibold ${
                  pos.unrealised >= 0 ? "text-green-600" : "text-red-500"
                }`}>
                  {pos.unrealised >= 0 ? "+" : ""}${pos.unrealised.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-sm font-medium text-muted-foreground">
                Total unrealised PnL
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-green-600">
                +${stub.reduce((s, p) => s + p.unrealised, 0).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Stub data only — not connected to live positions
      </p>
    </div>
  );
}
