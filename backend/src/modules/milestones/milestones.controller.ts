import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated, sendNoContent } from "../../utils/apiResponse.js";
import * as milestonesService from "./milestones.service.js";

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.addMilestone(req.params.dealId, user.id, req.body);
    sendCreated(res, result, "Milestone added");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.listMilestones(req.params.dealId, user.id);
    sendSuccess(res, result, "Milestones retrieved");
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.updateMilestone(req.params.milestoneId, user.id, req.body);
    sendSuccess(res, result, "Milestone updated");
  } catch (err) {
    next(err);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.submitMilestone(req.params.milestoneId, user.id);
    sendSuccess(res, result, "Milestone submitted");
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.approveMilestone(req.params.milestoneId, user.id);
    sendSuccess(res, result, "Milestone approved");
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await milestonesService.rejectMilestone(
      req.params.milestoneId, user.id, req.body.reason
    );
    sendSuccess(res, result, "Milestone rejected");
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    await milestonesService.deleteMilestone(req.params.milestoneId, user.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
