import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated, sendNoContent } from "../../utils/apiResponse.js";
import * as contractsService from "./contracts.service.js";

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const fileUrl = req.file ? (req.file as any).path : undefined;
    const result = await contractsService.uploadContract(user.id, req.body, fileUrl);
    sendCreated(res, result, "Contract uploaded");
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
