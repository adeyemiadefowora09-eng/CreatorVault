import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:5001/api/v1";

// Bridge to AI Deal Guardian (Contract Analysis)
router.post("/deal-guardian/analyze", authenticate, async (req, res, next) => {
  try {
    const response = await fetch(`${AI_ENGINE_URL}/guardian/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) throw new Error("AI Engine failed to process contract");
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// Bridge to Trust Score Engine
router.post("/trust-score/calculate", authenticate, async (req, res, next) => {
  try {
    const response = await fetch(`${AI_ENGINE_URL}/trust/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) throw new Error("Failed to calculate Trust Score");
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
