"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = __importDefault(require("../core/utils/Logger"));
class CproValidationError extends Error {
    constructor(message, errors) {
        super(message);
        this.printValidationError(message, errors);
    }
    printValidationError(message, errors) {
        for (const key in errors) {
            // @ts-ignore
            const value = errors[key];
            Logger_1.default.error(`${value.instancePath} - ${value.message}`);
        }
    }
}
exports.default = CproValidationError;
//# sourceMappingURL=CproValidationError.js.map