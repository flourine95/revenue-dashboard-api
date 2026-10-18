import type { NextFunction, Request, Response } from "express"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details)
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message)
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message)
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, "CONFLICT", message, details)
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} does not exist`,
    },
  })
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
    return
  }

  // Body-parser raises SyntaxError for malformed JSON payloads.
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: "Request body is not valid JSON" },
    })
    return
  }

  console.error("[error]", err)
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  })
}
