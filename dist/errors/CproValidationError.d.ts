import { ErrorObject } from 'ajv';
export default class CproValidationError extends Error {
    constructor(message: string, errors: ErrorObject<string, Record<string, any>, unknown>[] | null | undefined);
    private printValidationError;
}
