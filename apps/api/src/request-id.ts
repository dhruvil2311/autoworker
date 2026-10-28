import type { NextFunction, Request, Response } from "express";
import { createRequestId } from "@ghost/observability";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = req.header("x-request-id") ?? createRequestId();
  res.setHeader("x-request-id", req.id);
  next();
}
