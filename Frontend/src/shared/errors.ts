import type { AppError } from "./data-contract";

export class DomainError extends Error {
  public readonly code: AppError["code"];
  public readonly fieldErrors?: Record<string, string>;

  constructor(code: AppError["code"], message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  toAppError(): AppError {
    return {
      code: this.code,
      message: this.message,
      fieldErrors: this.fieldErrors,
    };
  }
}

export function createAppError(
  code: AppError["code"],
  message: string,
  fieldErrors?: Record<string, string>
): AppError {
  return { code, message, fieldErrors };
}
