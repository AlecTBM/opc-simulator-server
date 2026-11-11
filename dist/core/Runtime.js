"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_events_1 = require("node:events");
const OpcServer_1 = __importDefault(require("./opc/OpcServer"));
const Validator_1 = __importDefault(require("./utils/Validator"));
const Logger_1 = __importDefault(require("./utils/Logger"));
class Runtime extends node_events_1.EventEmitter {
    devices;
    OpcServer;
    Validator;
    constructor({ devices, devicesSchema }) {
        super();
        this.devices = devices;
        this.Validator = new Validator_1.default(devicesSchema);
        this.OpcServer = new OpcServer_1.default(this.devices);
    }
    async init() {
        try {
            this.Validator.validateDevicesSchema(this.devices);
            await this.OpcServer.start();
        }
        catch (error) {
            Logger_1.default.error(`Failed to start runtime`);
            this.emit('error', error);
            process.exit(1);
        }
    }
}
exports.default = Runtime;
//# sourceMappingURL=Runtime.js.map