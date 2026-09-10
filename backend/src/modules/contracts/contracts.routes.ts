import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { uploadContractSchema } from "./contracts.validation.js";
import * as contractsController from "./contracts.controller.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, matches deal-guardian's limit
});

// multer runs before validate() so a multipart file upload's other fields
// (dealId, etc.) land in req.body the same way a plain JSON post would.
// This was previously missing entirely — req.file was always undefined, so
// uploading an actual file (as opposed to pasting rawText) always failed.
router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  validate(uploadContractSchema),
  contractsController.upload
);
router.get("/", authenticate, contractsController.list);
router.get("/:id", authenticate, contractsController.get);
router.post("/:id/sign", authenticate, contractsController.sign);
// Run AI Deal Guardian analysis against this deal's actual contract. This
// was the missing link between the Contract/ContractAnalysis models and the
// AI Deal Guardian feature — previously a contract could be signed with no
// AI risk check ever having touched it.
router.post("/:id/analyze", authenticate, contractsController.analyze);
router.delete("/:id", authenticate, contractsController.remove);

export default router;
