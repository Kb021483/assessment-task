"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { api } from "@/lib/api";

export default function PurchasesPage() {
  const [walletInput, setWalletInput] = useState("");
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadPurchases(wallet = "") {
    setLoading(true);
    setError(null);
    try {
      const data = await api.purchases(wallet.trim() || undefined);
      setPurchases(data.purchases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchases");
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    loadPurchases(walletInput);
  }

  function handleClear() {
    setWalletInput("");
    loadPurchases("");
  }

  return (
    <>
      <SiteHeader variant="app" />
      <main className="mx-auto w-full max-w-[1440px] px-6 py-10 md:px-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-[family-name:JetBrains_Mono] text-[12px] tracking-[0.14em] text-accent-soft">
              BLOCKCHAIN ON-CHAIN TELEMETRY // LICENSES
            </p>
            <h1 className="mt-2 font-[family-name:Archivo] text-3xl font-extrabold md:text-4xl">
              Purchased Licenses & Transaction History
            </h1>
            <p className="mt-2 text-sm text-text-dim">
              Verified ERC-1155 license purchases monitored directly from the
              marketplace smart contract.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="rounded-lg bg-accent px-4 py-2.5 font-[family-name:JetBrains_Mono] text-[12px] font-bold tracking-wide text-white hover:bg-accent-deep"
          >
            EXPLORE MARKETPLACE
          </Link>
        </div>

        {/* Search by Wallet Address Form */}
        <form
          onSubmit={handleSearch}
          className="mb-8 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            placeholder="Filter by wallet address (e.g. 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)..."
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            className="w-full max-w-xl rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent/10 px-5 py-2.5 font-[family-name:JetBrains_Mono] text-xs font-bold text-accent-soft hover:bg-accent hover:text-white"
          >
            FILTER WALLET
          </button>
          {walletInput && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-border px-4 py-2.5 font-[family-name:JetBrains_Mono] text-xs text-text-dim hover:text-text"
            >
              CLEAR
            </button>
          )}
          <button
            type="button"
            onClick={() => loadPurchases(walletInput)}
            className="rounded-lg border border-border px-4 py-2.5 font-[family-name:JetBrains_Mono] text-xs text-text-dim hover:text-text"
          >
            REFRESH
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-[family-name:JetBrains_Mono] text-sm text-text-dim">
            LOADING ON-CHAIN PURCHASES...
          </div>
        ) : purchases.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-elevated p-12 text-center">
            <p className="text-lg font-semibold text-text">
              No purchases found
            </p>
            <p className="mt-2 text-sm text-text-dim">
              {walletInput
                ? `No license acquisitions found for wallet ${walletInput}`
                : "No on-chain license purchases have been recorded yet."}
            </p>
            <Link
              href="/marketplace"
              className="mt-6 inline-block rounded-lg bg-accent px-5 py-2.5 font-[family-name:JetBrains_Mono] text-xs font-bold text-white hover:bg-accent-deep"
            >
              BROWSE MARKETPLACE
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-text-dim">
              <span>Found {purchases.length} verified purchase(s)</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-border bg-bg text-text-dim">
                  <tr>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      MODEL / LICENSE
                    </th>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      BUYER WALLET
                    </th>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      PRICE PAID
                    </th>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      TRANSACTION HASH
                    </th>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      CONFIRMATION
                    </th>
                    <th className="px-5 py-3 font-[family-name:JetBrains_Mono] text-[10px] font-medium tracking-wider">
                      DATE
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchases.map((p) => {
                    const tx = p.transaction || {};
                    const conf = p.confirmation || {};
                    const model = p.model || {};

                    return (
                      <tr
                        key={p.id || tx.transactionHash}
                        className="hover:bg-bg/40"
                      >
                        <td className="px-5 py-4">
                          {model.slug ? (
                            <Link
                              href={`/models/${model.slug}`}
                              className="font-medium text-text hover:text-accent-soft"
                            >
                              {model.name || model.slug}
                            </Link>
                          ) : (
                            <span className="font-medium text-text">
                              {model.name || "AI Model License"}
                            </span>
                          )}
                          <div className="font-[family-name:JetBrains_Mono] text-xs text-text-dim">
                            Token #{tx.tokenId || "—"} ·{" "}
                            {model.category || "AI License"}
                          </div>
                        </td>

                        <td className="px-5 py-4 font-[family-name:JetBrains_Mono] text-xs text-text-muted">
                          {p.buyerWalletAddress ? (
                            <span title={p.buyerWalletAddress}>
                              {p.buyerWalletAddress.slice(0, 8)}...
                              {p.buyerWalletAddress.slice(-6)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="font-[family-name:JetBrains_Mono] font-semibold text-accent-soft">
                            {tx.purchaseAmountEth != null
                              ? `${tx.purchaseAmountEth} ETH`
                              : "—"}
                          </span>
                          <div className="text-[11px] text-text-dim">
                            Qty: {tx.licenseQuantity || 1}
                          </div>
                        </td>

                        <td className="px-5 py-4 font-[family-name:JetBrains_Mono] text-xs">
                          {tx.transactionHash ? (
                            <span
                              className="text-text-muted"
                              title={tx.transactionHash}
                            >
                              {tx.transactionHash.slice(0, 10)}...
                              {tx.transactionHash.slice(-8)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            {conf.status || "confirmed"}
                          </span>
                          <div className="mt-0.5 font-[family-name:JetBrains_Mono] text-[10px] text-text-dim">
                            Block #{conf.blockNumber || "—"} (
                            {conf.confirmations || 1} conf)
                          </div>
                        </td>

                        <td className="px-5 py-4 font-[family-name:JetBrains_Mono] text-xs text-text-dim">
                          {tx.purchaseTimestamp
                            ? new Date(tx.purchaseTimestamp).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
