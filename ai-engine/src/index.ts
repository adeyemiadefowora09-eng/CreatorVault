import express from "express";
import cors from "cors";
import { analyzeContract } from "./deal-guardian/dealGuardian.service.js";
import { calculateTrustScore } from "./trust-score/trustScore.service.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

// AI Deal Guardian Endpoint
app.post("/api/v1/guardian/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const analysis = await analyzeContract(text);
    res.json({ success: true, data: analysis });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trust Score Endpoint
app.post("/api/v1/trust/calculate", (req, res) => {
  try {
    const score = calculateTrustScore(req.body);
    res.json({ success: true, data: { score } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: "Invalid input data" });
  }
});

app.listen(PORT, () => {
  console.log(`AI Deal Guardian & Trust Score Service running on port ${PORT}`);
});
