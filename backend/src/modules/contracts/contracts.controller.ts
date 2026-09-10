import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated, sendNoContent } from "../../utils/apiResponse.js";
import * as contractsService from "./contracts.service.js";
import { extractContractText } from "../deal-guardian/extractText.js";

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;

    // With multer wired in as memoryStorage, a file upload arrives as a
    // buffer (req.file.path does not exist for memoryStorage) — extract its
    // text the same way deal-guardian does, rather than trying to persist a
    // filesystem path that was never actually being written anywhere.
    let rawText = req.body.rawText as string | undefined;
    if (req.file) {
      rawText = await extractContractText(req.file);
    }

    const result = await contractsService.uploadContract(
      user.id,
      { ...req.body, rawText },
      undefined
    );
    sendCreated(res, result, "Contract uploaded");
  } catch (err) {
    next(err);
  }
}

export async function analyze(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await contractsService.analyzeContract(req.params.id, user.id);
    sendSuccess(res, result, "Contract analyzed");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await contractsService.listContracts(user.id);
    sendSuccess(res, result, "Contracts retrieved");
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await contractsService.getContractById(req.params.id, user.id);
    sendSuccess(res, result, "Contract retrieved");
  } catch (err) {
    next(err);
  }
}

export async function sign(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await contractsService.signContract(req.params.id, user.id);
    sendSuccess(res, result, "Contract signed");
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    await contractsService.deleteContract(req.params.id, user.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
