const { formatEther, getAddress, isAddress } = require("ethers");
const { chainConfig, getMarketplace, getProvider } = require("./marketplace");
const { findModel, savePurchase, store } = require("../data/store");

class TransactionVerificationError extends Error {
  constructor(message, statusCode = 400, code = "VerificationFailed") {
    super(message);
    this.name = "TransactionVerificationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function validateAddress(address) {
  if (!address || typeof address !== "string") {
    throw new TransactionVerificationError(
      "Wallet address is required",
      400,
      "InvalidAddress",
    );
  }
  if (!isAddress(address)) {
    throw new TransactionVerificationError(
      `Invalid Ethereum wallet address format: ${address}`,
      400,
      "InvalidAddress",
    );
  }
  return getAddress(address);
}

async function resolveModel(tokenId, contract) {
  const numTokenId = Number(tokenId);
  for (const model of store.models) {
    if (contract) {
      try {
        const onChainId = await contract.getTokenIdBySlug(model.slug);
        if (Number(onChainId) === numTokenId) {
          return model;
        }
      } catch {}
    }
  }

  if (contract) {
    try {
      const listing = await contract.getListing(tokenId);
      if (listing && listing.slug) {
        const found = findModel(listing.slug);
        if (found) return found;
        return {
          slug: listing.slug,
          name: listing.slug.replace(/-/g, " "),
          creator: listing.creator,
          priceEth: Number(formatEther(listing.priceWei)),
          status: listing.active ? "Active" : "Inactive",
        };
      }
    } catch {}
  }

  return {
    slug: `token-${numTokenId}`,
    name: `Model License #${numTokenId}`,
    creator: "Unknown Creator",
    priceEth: 0,
    status: "Unknown",
  };
}

async function verifyTransaction(txHash, options = {}) {
  if (!txHash || typeof txHash !== "string") {
    throw new TransactionVerificationError(
      "Blockchain transaction hash is required",
      400,
      "MissingTxHash",
    );
  }

  const expectedMarketplace = (
    options.marketplaceAddress || chainConfig.marketplace
  ).toLowerCase();

  let provider;
  try {
    provider = options.provider || getProvider();
  } catch (err) {
    throw new TransactionVerificationError(
      `Failed to connect to blockchain RPC: ${err.message}`,
      503,
      "RpcError",
    );
  }

  let tx;
  try {
    tx = await provider.getTransaction(txHash);
  } catch (err) {
    throw new TransactionVerificationError(
      `Blockchain RPC error fetching transaction: ${err.message}`,
      503,
      "RpcError",
    );
  }

  if (!tx) {
    throw new TransactionVerificationError(
      `Transaction ${txHash} not found on blockchain`,
      404,
      "TransactionNotFound",
    );
  }

  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (err) {
    throw new TransactionVerificationError(
      `Blockchain RPC error fetching receipt: ${err.message}`,
      503,
      "RpcError",
    );
  }

  if (!receipt) {
    throw new TransactionVerificationError(
      `Transaction receipt not found or still pending for ${txHash}`,
      404,
      "ReceiptNotFound",
    );
  }

  if (receipt.status !== 1) {
    throw new TransactionVerificationError(
      `Transaction ${txHash} failed on-chain (status = ${receipt.status})`,
      422,
      "TransactionFailed",
    );
  }

  const contract = options.contract || getMarketplace(provider);
  const licenseAcquiredTopic =
    contract.interface.getEvent("LicenseAcquired").topicHash;

  const relevantLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === expectedMarketplace &&
      log.topics[0] === licenseAcquiredTopic,
  );

  if (!relevantLog) {
    throw new TransactionVerificationError(
      `No LicenseAcquired event from expected marketplace (${expectedMarketplace}) found in transaction ${txHash}`,
      422,
      "InvalidContractEvent",
    );
  }

  let parsedEvent;
  try {
    parsedEvent = contract.interface.parseLog({
      topics: relevantLog.topics,
      data: relevantLog.data,
    });
  } catch (err) {
    throw new TransactionVerificationError(
      `Failed to parse LicenseAcquired event: ${err.message}`,
      422,
      "EventParseError",
    );
  }

  const { tokenId, buyer, creator, priceWei } = parsedEvent.args;
  const eventBuyerAddress = getAddress(buyer);

  if (options.expectedBuyer) {
    const normalizedExpected = validateAddress(options.expectedBuyer);
    if (normalizedExpected.toLowerCase() !== eventBuyerAddress.toLowerCase()) {
      throw new TransactionVerificationError(
        `Buyer address mismatch: transaction buyer is ${eventBuyerAddress}, expected ${normalizedExpected}`,
        400,
        "BuyerMismatch",
      );
    }
  }

  let blockTimestamp = new Date().toISOString();
  let confirmations = 1;
  try {
    const [block, currentBlockNumber] = await Promise.all([
      provider.getBlock(receipt.blockNumber),
      provider.getBlockNumber(),
    ]);
    if (block && block.timestamp) {
      blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
    }
    if (currentBlockNumber && receipt.blockNumber) {
      confirmations = Math.max(1, currentBlockNumber - receipt.blockNumber + 1);
    }
  } catch {
    // Non-fatal, use defaults
  }

  const model = await resolveModel(tokenId, contract);

  return {
    buyerWalletAddress: eventBuyerAddress,
    modelIdentifier: model.slug || `token-${Number(tokenId)}`,
    tokenId: Number(tokenId),
    modelSlug: model.slug || null,
    model: {
      slug: model.slug,
      name: model.name,
      creator: model.creator,
      category: model.category,
      categorySlug: model.categorySlug,
      description: model.description,
      image: model.image,
      price: model.price,
      priceEth: model.priceEth,
      rating: model.rating,
    },
    purchaseAmountEth: Number(formatEther(priceWei)),
    purchaseAmountWei: priceWei.toString(),
    blockchainTransactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    purchaseTimestamp: blockTimestamp,
    licenseQuantity: 1,
    creatorAddress: getAddress(creator),
    contractAddress: expectedMarketplace,
    chainId: chainConfig.chainId,
    confirmations,
    status: "confirmed",
  };
}

async function verifyAndRecordPurchase(txHash, options = {}) {
  const verifiedData = await verifyTransaction(txHash, options);
  const { isNew, purchase } = savePurchase(verifiedData);
  return { isNew, purchase };
}

async function processLicenseAcquiredEvent(logOrEvent, contract, provider) {
  try {
    const txHash =
      logOrEvent.transactionHash || logOrEvent.log?.transactionHash;
    if (!txHash) return null;

    return await verifyAndRecordPurchase(txHash, {
      contract,
      provider,
      marketplaceAddress: contract.target || chainConfig.marketplace,
    });
  } catch (error) {
    console.error(
      `[TransactionTracker] Error processing event: ${error.message}`,
    );
    return null;
  }
}

class TransactionTrackerService {
  constructor() {
    this.isRunning = false;
    this.lastProcessedBlock = 0;
    this.pollInterval = null;
    this.contract = null;
    this.provider = null;
  }

  async start(options = {}) {
    if (this.isRunning) return;

    try {
      this.provider = options.provider || getProvider();
      this.contract = options.contract || getMarketplace(this.provider);

      const currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock =
        options.fromBlock != null
          ? options.fromBlock
          : Math.max(0, currentBlock - 100);

      this.isRunning = true;
      console.log(
        `[TransactionTracker] Started tracking at block ${this.lastProcessedBlock} (current: ${currentBlock})`,
      );

      await this.syncPastEvents(this.lastProcessedBlock, currentBlock);
      this.lastProcessedBlock = currentBlock;

      this.contract.on(
        "LicenseAcquired",
        async (
          tokenId,
          buyer,
          creator,
          priceWei,
          fee,
          proceeds,
          eventPayload,
        ) => {
          const txHash = eventPayload?.log?.transactionHash;
          if (txHash) {
            await verifyAndRecordPurchase(txHash, {
              contract: this.contract,
              provider: this.provider,
            });
          }
        },
      );

      const intervalMs = options.pollIntervalMs || 10000;
      this.pollInterval = setInterval(async () => {
        try {
          const latest = await this.provider.getBlockNumber();
          if (latest > this.lastProcessedBlock) {
            await this.syncPastEvents(this.lastProcessedBlock + 1, latest);
            this.lastProcessedBlock = latest;
          }
        } catch {}
      }, intervalMs);
    } catch (error) {
      console.warn(
        `[TransactionTracker] Could not start tracker: ${error.message}`,
      );
    }
  }

  async syncPastEvents(fromBlock, toBlock) {
    if (!this.contract || fromBlock > toBlock) return;
    try {
      const filter = this.contract.filters.LicenseAcquired();
      const events = await this.contract.queryFilter(
        filter,
        fromBlock,
        toBlock,
      );
      for (const event of events) {
        const txHash = event.transactionHash;
        if (txHash) {
          await verifyAndRecordPurchase(txHash, {
            contract: this.contract,
            provider: this.provider,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[TransactionTracker] Historical sync error: ${err.message}`,
      );
    }
  }

  stop() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.contract) {
      try {
        this.contract.removeAllListeners("LicenseAcquired");
      } catch {
        // ignore
      }
    }
    console.log("[TransactionTracker] Stopped");
  }
}

const transactionTracker = new TransactionTrackerService();

module.exports = {
  TransactionVerificationError,
  validateAddress,
  verifyTransaction,
  verifyAndRecordPurchase,
  processLicenseAcquiredEvent,
  transactionTracker,
};
