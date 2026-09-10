const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const {
  Interface,
  parseEther,
  formatEther,
  Wallet,
  getAddress,
} = require("ethers");

const {
  store,
  savePurchase,
  getPurchasesByWallet,
  findModel,
} = require("../src/data/store");
const {
  verifyTransaction,
  verifyAndRecordPurchase,
  validateAddress,
  TransactionVerificationError,
} = require("../src/chain/transactionTracker");
const { app } = require("../src/index");
const { chainConfig } = require("../src/chain/marketplace");
const marketplaceAbi = chainConfig.abi;

function makeRequest(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(data),
            });
          } catch {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      },
    );
    req.on("error", reject);
    if (options.body) {
      req.write(
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
      );
    }
    req.end();
  });
}

describe("Blockchain Transaction Tracking & Verification", () => {
  const dummyMarketplace = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const dummyBuyer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const dummyCreator = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const dummyTxHash = "0x" + "1".repeat(64);

  const iface = new Interface(marketplaceAbi);
  const licenseEvent = iface.getEvent("LicenseAcquired");

  function createMockReceipt(opts = {}) {
    const status = opts.status ?? 1;
    const contractAddress = (
      opts.contractAddress || dummyMarketplace
    ).toLowerCase();
    const buyer = opts.buyer || dummyBuyer;
    const tokenId = opts.tokenId ?? 1n;
    const priceWei = opts.priceWei ?? parseEther("0.48");
    const omitLog = opts.omitLog || false;

    let logs = [];
    if (!omitLog) {
      const logData = iface.encodeEventLog(licenseEvent, [
        BigInt(tokenId),
        buyer,
        dummyCreator,
        BigInt(priceWei),
        BigInt(priceWei) / 40n,
        BigInt(priceWei) - BigInt(priceWei) / 40n,
      ]);

      logs = [
        {
          address: contractAddress,
          topics: logData.topics,
          data: logData.data,
          blockNumber: 105,
          transactionHash: opts.txHash || dummyTxHash,
        },
      ];
    }

    return {
      status,
      hash: opts.txHash || dummyTxHash,
      blockNumber: 105,
      logs,
    };
  }

  function createMockProvider(opts = {}) {
    return {
      getTransaction: async (hash) => {
        if (opts.missingTx) return null;
        if (opts.rpcError) throw new Error("Connection refused to RPC");
        return { hash, blockNumber: 105 };
      },
      getTransactionReceipt: async (hash) => {
        if (opts.missingReceipt) return null;
        if (opts.rpcError) throw new Error("Connection refused to RPC");
        return createMockReceipt(opts);
      },
      getBlock: async () => ({
        timestamp: 1773000000n,
      }),
      getBlockNumber: async () => 110,
    };
  }

  function createMockContract() {
    return {
      interface: iface,
      getTokenIdBySlug: async (slug) => (slug === "visionforge-pro" ? 1n : 0n),
      getListing: async (tokenId) => ({
        creator: dummyCreator,
        priceWei: parseEther("0.48"),
        slug: "visionforge-pro",
        active: true,
      }),
    };
  }

  beforeEach(() => {
    store.purchases = [];
  });

  test("1. Successfully verifies and extracts on-chain purchase information", async () => {
    const mockProvider = createMockProvider();
    const mockContract = createMockContract();

    const verified = await verifyTransaction(dummyTxHash, {
      provider: mockProvider,
      contract: mockContract,
      marketplaceAddress: dummyMarketplace,
      expectedBuyer: dummyBuyer,
    });

    assert.strictEqual(
      verified.buyerWalletAddress.toLowerCase(),
      dummyBuyer.toLowerCase(),
    );
    assert.strictEqual(verified.tokenId, 1);
    assert.strictEqual(verified.modelSlug, "visionforge-pro");
    assert.strictEqual(verified.purchaseAmountEth, 0.48);
    assert.strictEqual(verified.blockchainTransactionHash, dummyTxHash);
    assert.strictEqual(verified.blockNumber, 105);
    assert.strictEqual(verified.licenseQuantity, 1);
    assert.strictEqual(verified.status, "confirmed");
    assert.ok(verified.confirmations >= 1);
    assert.ok(verified.model.name);
  });

  test("2. Rejects if transaction is not found on-chain", async () => {
    const mockProvider = createMockProvider({ missingTx: true });
    await assert.rejects(
      async () => {
        await verifyTransaction(dummyTxHash, {
          provider: mockProvider,
          marketplaceAddress: dummyMarketplace,
        });
      },
      (err) => {
        assert.strictEqual(err.code, "TransactionNotFound");
        assert.strictEqual(err.statusCode, 404);
        return true;
      },
    );
  });

  test("3. Rejects if transaction failed on-chain (receipt.status === 0)", async () => {
    const mockProvider = createMockProvider({ status: 0 });
    await assert.rejects(
      async () => {
        await verifyTransaction(dummyTxHash, {
          provider: mockProvider,
          marketplaceAddress: dummyMarketplace,
        });
      },
      (err) => {
        assert.strictEqual(err.code, "TransactionFailed");
        assert.strictEqual(err.statusCode, 422);
        return true;
      },
    );
  });

  test("4. Rejects if event originated from unexpected contract", async () => {
    const mockProvider = createMockProvider({
      contractAddress: "0x0000000000000000000000000000000000000001",
    });
    await assert.rejects(
      async () => {
        await verifyTransaction(dummyTxHash, {
          provider: mockProvider,
          marketplaceAddress: dummyMarketplace,
        });
      },
      (err) => {
        assert.strictEqual(err.code, "InvalidContractEvent");
        assert.strictEqual(err.statusCode, 422);
        return true;
      },
    );
  });

  test("5. Rejects if buyer address does not match event data", async () => {
    const mockProvider = createMockProvider();
    const wrongBuyer = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

    await assert.rejects(
      async () => {
        await verifyTransaction(dummyTxHash, {
          provider: mockProvider,
          marketplaceAddress: dummyMarketplace,
          expectedBuyer: wrongBuyer,
        });
      },
      (err) => {
        assert.strictEqual(err.code, "BuyerMismatch");
        assert.strictEqual(err.statusCode, 400);
        return true;
      },
    );
  });

  test("6. Validates wallet addresses and rejects invalid format", () => {
    assert.throws(
      () => validateAddress("not-an-eth-address"),
      (err) => {
        assert.strictEqual(err.code, "InvalidAddress");
        assert.strictEqual(err.statusCode, 400);
        return true;
      },
    );
    assert.strictEqual(
      validateAddress(dummyBuyer).toLowerCase(),
      dummyBuyer.toLowerCase(),
    );
  });

  test("7. Prevents duplicate transaction records and handles repeated processing safely", async () => {
    const mockProvider = createMockProvider();
    const mockContract = createMockContract();

    // First call
    const res1 = await verifyAndRecordPurchase(dummyTxHash, {
      provider: mockProvider,
      contract: mockContract,
      marketplaceAddress: dummyMarketplace,
    });
    assert.strictEqual(res1.isNew, true);
    assert.strictEqual(store.purchases.length, 1);

    // Repeated call with same txHash
    const res2 = await verifyAndRecordPurchase(dummyTxHash, {
      provider: mockProvider,
      contract: mockContract,
      marketplaceAddress: dummyMarketplace,
    });
    assert.strictEqual(res2.isNew, false);
    assert.strictEqual(
      store.purchases.length,
      1,
      "Should not duplicate record",
    );
  });

  test("8. Handles unknown token IDs gracefully without crashing", async () => {
    const mockProvider = createMockProvider({ tokenId: 9999n });
    const mockContract = {
      interface: iface,
      getTokenIdBySlug: async () => 0n,
      getListing: async () => null,
    };

    const verified = await verifyTransaction(dummyTxHash, {
      provider: mockProvider,
      contract: mockContract,
      marketplaceAddress: dummyMarketplace,
    });

    assert.strictEqual(verified.tokenId, 9999);
    assert.strictEqual(verified.modelIdentifier, "token-9999");
    assert.ok(verified.model);
    assert.strictEqual(verified.model.slug, "token-9999");
  });

  test("9. Handles blockchain RPC failures gracefully", async () => {
    const mockProvider = createMockProvider({ rpcError: true });

    await assert.rejects(
      async () => {
        await verifyTransaction(dummyTxHash, {
          provider: mockProvider,
          marketplaceAddress: dummyMarketplace,
        });
      },
      (err) => {
        assert.strictEqual(err.code, "RpcError");
        assert.strictEqual(err.statusCode, 503);
        return true;
      },
    );
  });
});

describe("Purchase History API Endpoints", () => {
  let testServer;
  const buyerA = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const buyerB = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

  beforeEach((_, done) => {
    store.purchases = [];
    testServer = http.createServer(app);
    testServer.listen(0, "127.0.0.1", done);
  });

  test("GET /api/purchases?walletAddress= returns filtered purchases", async () => {
    // Seed purchases
    savePurchase({
      buyerWalletAddress: buyerA,
      modelSlug: "visionforge-pro",
      tokenId: 1,
      blockchainTransactionHash: "0x" + "a".repeat(64),
      blockNumber: 101,
      purchaseAmountEth: 0.48,
      purchaseAmountWei: "480000000000000000",
    });

    savePurchase({
      buyerWalletAddress: buyerB,
      modelSlug: "synthdiffusion-v4-highres",
      tokenId: 2,
      blockchainTransactionHash: "0x" + "b".repeat(64),
      blockNumber: 102,
      purchaseAmountEth: 0.32,
      purchaseAmountWei: "320000000000000000",
    });

    // Query buyerA
    const res = await makeRequest(
      testServer,
      `/api/purchases?walletAddress=${buyerA}`,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPurchases, 1);
    assert.strictEqual(
      res.body.purchases[0].buyerWalletAddress.toLowerCase(),
      buyerA.toLowerCase(),
    );
    assert.strictEqual(res.body.purchases[0].model.slug, "visionforge-pro");
    assert.strictEqual(
      res.body.purchases[0].transaction.transactionHash,
      "0x" + "a".repeat(64),
    );
    assert.strictEqual(res.body.purchases[0].confirmation.status, "confirmed");

    testServer.close();
  });

  test("GET /api/purchases/:walletAddress returns purchases by route param", async () => {
    savePurchase({
      buyerWalletAddress: buyerA,
      modelSlug: "visionforge-pro",
      tokenId: 1,
      blockchainTransactionHash: "0x" + "c".repeat(64),
    });

    const res = await makeRequest(testServer, `/api/purchases/${buyerA}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPurchases, 1);
    assert.strictEqual(
      res.body.purchases[0].buyerWalletAddress.toLowerCase(),
      buyerA.toLowerCase(),
    );

    testServer.close();
  });

  test("GET /api/purchases?walletAddress= invalid address returns 400", async () => {
    const res = await makeRequest(
      testServer,
      "/api/purchases?walletAddress=invalid-address",
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "InvalidAddress");

    testServer.close();
  });

  test("GET /api/purchases/tx/:txHash returns specific purchase details", async () => {
    const txHash = "0x" + "d".repeat(64);
    savePurchase({
      buyerWalletAddress: buyerA,
      modelSlug: "visionforge-pro",
      tokenId: 1,
      blockchainTransactionHash: txHash,
      blockNumber: 200,
    });

    const res = await makeRequest(testServer, `/api/purchases/tx/${txHash}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.purchase.transaction.transactionHash, txHash);
    assert.strictEqual(res.body.purchase.confirmation.blockNumber, 200);

    testServer.close();
  });
});
