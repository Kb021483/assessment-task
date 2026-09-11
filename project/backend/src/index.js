const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const cors = require("cors");
const express = require("express");
const { authRouter } = require("./routes/auth");
const { chainRouter } = require("./routes/chain");
const { dashboardRouter } = require("./routes/dashboard");
const { metaRouter, modelsRouter } = require("./routes/models");
const { purchasesRouter } = require("./routes/purchases");
const { getChainStatus } = require("./chain/marketplace");
const { transactionTracker } = require("./chain/transactionTracker");

const app = express();
const PORT = Number(process.env.PORT || 4000);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (process.env.FRONTEND_ORIGIN && origin === process.env.FRONTEND_ORIGIN) {
    return true;
  }
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      /^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(hostname)
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/", async (_req, res) => {
  const chain = await getChainStatus();
  res.json({
    name: "NuvyraHub API",
    version: "1.1.0",
    chain,
    docs: {
      health: "GET /api/health",
      models: "GET /api/models",
      model: "GET /api/models/:slug",
      createModel: "POST /api/models",
      acquire: "POST /api/models/:slug/acquire",
      infer: "POST /api/models/:slug/infer",
      chainStatus: "GET /api/chain/status",
      chainConfig: "GET /api/chain/config",
      chainListing: "GET /api/chain/listing/:slug",
      chainList: "POST /api/chain/list/:slug",
      chainAcquire: "POST /api/chain/acquire/:slug",
      purchases: "GET /api/purchases?walletAddress=0x...",
      purchasesByWallet: "GET /api/purchases/:walletAddress",
      verifyPurchase: "POST /api/purchases/verify",
      categories: "GET /api/categories",
      tags: "GET /api/tags",
      signup: "POST /api/auth/signup",
      login: "POST /api/auth/login",
      wallet: "POST /api/auth/wallet",
      me: "GET /api/auth/me",
      dashboard: "GET /api/dashboard",
    },
  });
});

app.use("/api", metaRouter);
app.use("/api/models", modelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/chain", chainRouter);
app.use("/api/purchases", purchasesRouter);

app.use((err, _req, res, _next) => {
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "InternalServerError" : "BadRequest",
    message: status < 500 ? err.message : undefined,
  });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
      await transactionTracker.start();
    } catch (err) {
      console.warn(`[index.js] Transaction tracker deferred startup: ${err.message}`);
    }
  });
}

module.exports = { app, server };
