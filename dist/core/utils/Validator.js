"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ajv_1 = __importDefault(require("ajv"));
const CproValidationError_1 = __importDefault(require("../../errors/CproValidationError"));
const Logger_1 = __importDefault(require("./Logger"));
class Validator {
    validate;
    constructor(schema) {
        this.validate = new ajv_1.default().compile(schema);
    }
    validateDevicesSchema(data) {
        Logger_1.default.info('Validating OPC UA device data ...');
        const result = this.validate(data);
        if (!result) {
            throw new CproValidationError_1.default('Failed to validate OPC UA device data', this.validate.errors);
        }
        Logger_1.default.info('OPC UA device data is valid');
    }
}
exports.default = Validator;
//# sourceMappingURL=Validator.js.map