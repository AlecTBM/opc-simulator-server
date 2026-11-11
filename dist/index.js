"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const devices_json_1 = __importDefault(require("../data/devices.json"));
const devices_json_2 = __importDefault(require("../schemata/devices.json"));
const Logger_1 = __importDefault(require("./core/utils/Logger"));
const Runtime_1 = __importDefault(require("./core/Runtime"));
function main() {
    const runtime = new Runtime_1.default({ devices: devices_json_1.default, devicesSchema: devices_json_2.default });
    runtime.init().catch((error) => {
        Logger_1.default.error(error.message);
    });
}
main();
//# sourceMappingURL=index.js.map