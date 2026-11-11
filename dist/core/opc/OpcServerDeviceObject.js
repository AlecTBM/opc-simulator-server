"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_opcua_1 = require("node-opcua");
const Logger_1 = __importDefault(require("../utils/Logger"));
const Simulator_1 = __importDefault(require("../utils/Simulator"));
class ServerDeviceObject {
    device;
    namespace;
    objectsFolder;
    nodeRegistry = new Map();
    constructor(server, device) {
        this.device = device;
        this.namespace = server.engine.addressSpace?.getOwnNamespace();
        this.objectsFolder = server.engine.addressSpace?.rootFolder.objects;
        this.indexDeviceNodes(device);
    }
    init() {
        const deviceRootFolder = this.registerDeviceFolderNode(this.objectsFolder, this.device);
        this.device.items.forEach((node) => {
            this.registerDeviceNode(deviceRootFolder, node);
        });
    }
    indexDeviceNodes(node) {
        if ('items' in node) {
            node.items.forEach((item) => this.indexDeviceNodes(item));
        }
        else {
            this.nodeRegistry.set(node.id, node);
        }
    }
    registerDeviceNode(owner, node) {
        if ('items' in node) {
            const deviceSubFolder = this.registerDeviceFolderNode(owner, node);
            node.items.forEach((item) => this.registerDeviceNode(deviceSubFolder, item));
        }
        else {
            this.registerDeviceVariableNode(owner, node);
        }
    }
    registerDeviceFolderNode(owner, folder) {
        return this.namespace.addFolder(owner, {
            nodeId: folder.id,
            browseName: folder.name,
        });
    }
    registerDeviceVariableNode(owner, node) {
        if (node.simulation) {
            this.validateMapping(node);
            new Simulator_1.default(this.namespace, node).simulateNodeValue();
        }
        return this.namespace.addVariable({
            componentOf: owner,
            nodeId: node.id,
            browseName: node.name,
            dataType: this.inferValueType(node.value),
            minimumSamplingInterval: 250,
            value: this.constructNodeVariant(node),
        });
    }
    constructNodeVariant(node) {
        const valueBinding = {
            get: () => node_opcua_1.StatusCodes.BadNotReadable,
            set: () => node_opcua_1.StatusCodes.BadNotWritable,
        };
        if (node.valueMethods.includes('get')) {
            valueBinding.get = () => new node_opcua_1.Variant({
                dataType: this.inferValueType(node.value),
                value: node.value,
            });
        }
        if (node.valueMethods.includes('set')) {
            valueBinding.set = (variant) => {
                const newValue = variant.value;
                const reverseResult = this.applyReverseMapping(node, newValue);
                if (reverseResult !== node_opcua_1.StatusCodes.Good)
                    return reverseResult;
                node.value = newValue;
                return node_opcua_1.StatusCodes.Good;
            };
        }
        return valueBinding;
    }
    validateMapping(node) {
        const mapping = node.simulation?.mapping;
        if (!mapping?.bidirectional)
            return;
        const serializedValues = Object.values(mapping.map).map((value) => this.serializeMappingValue(value));
        if (new Set(serializedValues).size !== serializedValues.length) {
            throw new Error(`Bidirectional mapping for node ${node.id} contains duplicate output values`);
        }
        if (!this.nodeRegistry.has(mapping.source)) {
            throw new Error(`Mapping source node ${mapping.source} for node ${node.id} was not found`);
        }
    }
    applyReverseMapping(node, newValue) {
        const mapping = node.simulation?.mapping;
        if (!mapping?.bidirectional)
            return node_opcua_1.StatusCodes.Good;
        const matchingEntry = Object.entries(mapping.map).find(([, mappedValue]) => this.valuesEqual(mappedValue, newValue));
        if (!matchingEntry) {
            Logger_1.default.error(`Value ${newValue} is not valid for bidirectional mapping node ${node.id}`);
            return node_opcua_1.StatusCodes.BadOutOfRange;
        }
        const sourceNode = this.nodeRegistry.get(mapping.source);
        if (!sourceNode)
            return node_opcua_1.StatusCodes.BadNodeIdUnknown;
        sourceNode.value = this.convertMappingKey(matchingEntry[0], sourceNode.value);
        return node_opcua_1.StatusCodes.Good;
    }
    convertMappingKey(key, sourceValue) {
        if (typeof sourceValue === 'number')
            return Number(key);
        if (typeof sourceValue === 'boolean')
            return key === 'true';
        return key;
    }
    valuesEqual(left, right) {
        return typeof left === typeof right && left === right;
    }
    serializeMappingValue(value) {
        return `${typeof value}:${String(value)}`;
    }
    inferValueType(value) {
        if (typeof value === 'string')
            return node_opcua_1.DataType.String;
        if (typeof value === 'number')
            return node_opcua_1.DataType.Double;
        if (typeof value === 'boolean')
            return node_opcua_1.DataType.Boolean;
        return node_opcua_1.DataType.Null;
    }
}
exports.default = ServerDeviceObject;
//# sourceMappingURL=OpcServerDeviceObject.js.map