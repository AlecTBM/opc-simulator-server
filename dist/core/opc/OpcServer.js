"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_opcua_1 = require("node-opcua");
const OpcServerDeviceObject_1 = __importDefault(require("./OpcServerDeviceObject"));
const Logger_1 = __importDefault(require("../utils/Logger"));
class OpcServer {
    server;
    devices;
    constructor(devices, { port, } = {
        port: 4840,
    }) {
        this.server = new node_opcua_1.OPCUAServer({
            port: port || 4840,
            resourcePath: '/UA/Cpro',
            buildInfo: {
                productName: 'Cpro OPC UA Server',
                buildNumber: '1.0.0',
                buildDate: new Date(),
            },
        });
        this.devices = devices;
        this.server.on('post_initialize', () => {
            for (const device in this.devices) {
                const deviceObject = devices[device];
                this.printDeviceFolderStructure(deviceObject);
                const serverDeviceObject = new OpcServerDeviceObject_1.default(this.server, deviceObject).init();
            }
        });
    }
    async start() {
        try {
            await this.server.initialize();
            await this.server.start();
            Logger_1.default.info('OPC UA server started successfully');
        }
        catch (error) {
            Logger_1.default.error('Failed to start OPC UA server', error);
            process.exit(1);
        }
    }
    printDeviceFolderStructure(folder) {
        Logger_1.default.info(`📁 ${folder.name} [Folder]`);
        folder.items.forEach((item, index) => {
            if (item.hasOwnProperty('items')) {
                this.printDeviceFolderStructure(item);
            }
            else if (index === folder.items.length - 1) {
                Logger_1.default.info(`└─ ${item.name} [Variable]`);
                Logger_1.default.info(``);
            }
            else {
                Logger_1.default.info(`├─ ${item.name} [Variable]`);
            }
        });
    }
}
exports.default = OpcServer;
//# sourceMappingURL=OpcServer.js.map