import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { uploadContractSchema } from "./contracts.validation.js";
import * as contractsController from "./contracts.controller.js";
// Note: In a real app, use multer middleware here for file uploads
// import multer from "multer";
// const upload = multer({ dest: "uploads/" });

const router = Router();

// If using multer: router.post("/upload", authenticate, upload.single("file"), validate(uploadContractSchema), contractsController.upload);
router.post("/upload", authenticate, validate(uploadContractSchema), contractsController.upload);
router.get("/", authenticate, contractsController.list);
router.get("/:id", authenticate, contractsController.get);
router.post("/:id/sign", authenticate, contractsController.sign);
router.delete("/:id", authenticate, contractsController.remove);

export default router;
