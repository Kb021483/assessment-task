const { Router } = require("express");
const { isAddress, getAddress } = require("ethers");
const { getPurchasesByWallet, getPurchaseByTx } = require("../data/store");
const {
  verifyAndRecordPurchase,
  validateAddress,
  TransactionVerificationError,
} = require("../chain/transactionTracker");

const purchasesRouter = Router();

function formatPurchaseResponse(record) {
  return {
    id: record.id,
    buyerWalletAddress: record.buyerWalletAddress,
    model: record.model || {
      slug: record.modelSlug || record.modelIdentifier,
      name: record.modelIdentifier,
      status: "Active",
    },
    transaction: {
      transactionHash: record.blockchainTransactionHash,
      purchaseAmountEth: record.purchaseAmountEth,
      purchaseAmountWei: record.purchaseAmountWei,
      licenseQuantity: record.licenseQuantity || 1,
      purchaseTimestamp: record.purchaseTimestamp,
      buyerWalletAddress: record.buyerWalletAddress,
      modelIdentifier: record.modelIdentifier,
      tokenId: record.tokenId,
    },
    confirmation: {
      status: record.confirmation?.status || "confirmed",
      blockNumber: record.blockNumber || record.confirmation?.blockNumber,
      confirmations: record.confirmation?.confirmations || 1,
      contractAddress: record.confirmation?.contractAddress,
      chainId: record.confirmation?.chainId || 31337,
    },
    createdAt: record.createdAt,
  };
}

purchasesRouter.get("/", (req, res) => {
  const { walletAddress } = req.query;

  if (walletAddress) {
    if (!isAddress(walletAddress)) {
      return res.status(400).json({
        error: "InvalidAddress",
        message: `Invalid Ethereum wallet address format: ${walletAddress}`,
      });
    }
    const normalized = getAddress(walletAddress);
    const purchases = getPurchasesByWallet(normalized);
    return res.json({
      walletAddress: normalized,
      totalPurchases: purchases.length,
      purchases: purchases.map(formatPurchaseResponse),
    });
  }

  const allPurchases = getPurchasesByWallet();
  return res.json({
    totalPurchases: allPurchases.length,
    purchases: allPurchases.map(formatPurchaseResponse),
  });
});

purchasesRouter.get("/:walletAddress", (req, res) => {
  const { walletAddress } = req.params;

  if (!isAddress(walletAddress)) {
    return res.status(400).json({
      error: "InvalidAddress",
      message: `Invalid Ethereum wallet address format: ${walletAddress}`,
    });
  }

  const normalized = getAddress(walletAddress);
  const purchases = getPurchasesByWallet(normalized);

  return res.json({
    walletAddress: normalized,
    totalPurchases: purchases.length,
    purchases: purchases.map(formatPurchaseResponse),
  });
});

purchasesRouter.get("/tx/:txHash", (req, res) => {
  const purchase = getPurchaseByTx(req.params.txHash);
  if (!purchase) {
    return res.status(404).json({
      error: "NotFound",
      message: `No purchase record found for txHash ${req.params.txHash}`,
    });
  }
  return res.json({ purchase: formatPurchaseResponse(purchase) });
});

purchasesRouter.post("/verify", async (req, res) => {
  const { txHash, walletAddress } = req.body || {};

  if (!txHash) {
    return res.status(400).json({
      error: "ValidationError",
      message: "txHash is required",
    });
  }

  if (walletAddress && !isAddress(walletAddress)) {
    return res.status(400).json({
      error: "InvalidAddress",
      message: `Invalid Ethereum wallet address format: ${walletAddress}`,
    });
  }

  try {
    const { isNew, purchase } = await verifyAndRecordPurchase(txHash, {
      expectedBuyer: walletAddress,
    });

    return res.status(isNew ? 201 : 200).json({
      verified: true,
      isNew,
      purchase: formatPurchaseResponse(purchase),
      message: isNew
        ? "Purchase verified and recorded"
        : "Purchase already verified and recorded",
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      error: error.code || "VerificationError",
      message: error.message,
    });
  }
});

module.exports = { purchasesRouter, formatPurchaseResponse };
