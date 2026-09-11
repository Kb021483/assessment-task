const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { JsonRpcProvider, Wallet, parseEther } = require("ethers");

const { app } = require("../src/index");
const {
  getMarketplace,
  getOnChainListing,
  getDeployerWallet,
  chainConfig,
} = require("../src/chain/marketplace");
const {
  verifyAndRecordPurchase,
  transactionTracker,
} = require("../src/chain/transactionTracker");
const { store } = require("../src/data/store");

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
              body: JSON.parse(data),
            });
          } catch {
            resolve({ status: res.statusCode, body: data });
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

describe("Live Blockchain Integration with Hardhat Node", () => {
  let server;
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  let testBuyer;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const deployer = getDeployerWallet();
      testBuyer = Wallet.createRandom(provider);
      const tx = await deployer.sendTransaction({
        to: testBuyer.address,
        value: parseEther("1.0"),
      });
      await tx.wait();
    } catch {}
  });

  after(() => {
    transactionTracker.stop();
    if (server) server.close();
  });

  test("Live transaction tracking on Hardhat node", async () => {
    try {
      await provider.getBlockNumber();
    } catch {
      console.log("Hardhat node not available, skipping live test");
      return;
    }

    const market = getMarketplace(testBuyer);
    const tokenId = 1n;
    const listing = await market.getListing(tokenId);

    const tx = await market.acquireLicense(tokenId, {
      value: listing.priceWei,
    });
    const receipt = await tx.wait();

    assert.strictEqual(receipt.status, 1, "Transaction should succeed");

    const { isNew, purchase } = await verifyAndRecordPurchase(receipt.hash, {
      expectedBuyer: testBuyer.address,
    });

    assert.strictEqual(isNew, true);
    assert.strictEqual(
      purchase.buyerWalletAddress.toLowerCase(),
      testBuyer.address.toLowerCase(),
    );
    assert.strictEqual(purchase.tokenId, 1);
    assert.strictEqual(purchase.licenseQuantity, 1);
    assert.strictEqual(purchase.blockchainTransactionHash, receipt.hash);
    assert.ok(purchase.purchaseTimestamp);
    assert.strictEqual(purchase.confirmation.status, "confirmed");

    const res = await makeRequest(
      server,
      `/api/purchases?walletAddress=${testBuyer.address}`,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPurchases, 1);
    const record = res.body.purchases[0];

    assert.ok(record.model, "Must contain model information");
    assert.strictEqual(record.model.slug, "visionforge-pro");
    assert.ok(record.model.name);

    assert.ok(record.transaction, "Must contain purchase transaction details");
    assert.strictEqual(record.transaction.transactionHash, receipt.hash);
    assert.strictEqual(
      record.transaction.buyerWalletAddress.toLowerCase(),
      testBuyer.address.toLowerCase(),
    );
    assert.strictEqual(record.transaction.licenseQuantity, 1);
    assert.ok(record.transaction.purchaseTimestamp);

    assert.ok(
      record.confirmation,
      "Must contain blockchain confirmation information",
    );
    assert.strictEqual(record.confirmation.status, "confirmed");
    assert.ok(record.confirmation.blockNumber > 0);
    assert.ok(record.confirmation.confirmations >= 1);

    const secondCall = await verifyAndRecordPurchase(receipt.hash);
    assert.strictEqual(secondCall.isNew, false, "Must detect existing record");
  });
});
