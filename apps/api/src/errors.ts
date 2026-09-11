/** HTTP statuses this API maps input errors to. */
export type ApiInputErrorStatus = 400 | 404 | 413 | 415 | 422;

/** Typed input error from API-level validation, mapped to HTTP status. */
export class ApiInputError extends Error {
  readonly code: string;
  readonly status: ApiInputErrorStatus;

  constructor(code: string, message: string, status: ApiInputErrorStatus) {
    super(message);
    this.name = "ApiInputError";
    this.code = code;
    this.status = status;
  }
}
