import {
    Namespace,
    OPCUAServer,
    UAFolder,
    DataType,
    UAObjectsFolder,
    Variant,
    StatusCodes,
    StatusCode,
    VariantT,
} from 'node-opcua';
import { DeviceFolder, DeviceNode, SimulationValue } from '../../../@types';
import Logger from '../utils/Logger';
import Simulator from '../utils/Simulator';

export default class ServerDeviceObject {
    private device: DeviceFolder;
    private namespace: Namespace;
    private objectsFolder: UAObjectsFolder;
    private nodeRegistry = new Map<string, DeviceNode>();

    constructor(server: OPCUAServer, device: DeviceFolder) {
        this.device = device;
        this.namespace = server.engine.addressSpace?.getOwnNamespace() as Namespace;
        this.objectsFolder = server.engine.addressSpace?.rootFolder.objects as UAObjectsFolder;
        this.indexDeviceNodes(device);
    }

    public init() {
        const deviceRootFolder = this.registerDeviceFolderNode(this.objectsFolder, this.device);
        this.device.items.forEach((node: DeviceFolder | DeviceNode) => {
            this.registerDeviceNode(deviceRootFolder, node);
        });
    }

    private indexDeviceNodes(node: DeviceFolder | DeviceNode) {
        if ('items' in node) {
            node.items.forEach((item) => this.indexDeviceNodes(item));
        } else {
            this.nodeRegistry.set(node.id, node);
        }
    }

    private registerDeviceNode(owner: UAFolder, node: DeviceFolder | DeviceNode) {
        if ('items' in node) {
            const deviceSubFolder = this.registerDeviceFolderNode(owner, node);
            node.items.forEach((item) => this.registerDeviceNode(deviceSubFolder, item));
        } else {
            this.registerDeviceVariableNode(owner, node);
        }
    }

    private registerDeviceFolderNode(owner: UAFolder, folder: DeviceFolder) {
        return this.namespace.addFolder(owner, {
            nodeId: folder.id,
            browseName: folder.name,
        });
    }

    private registerDeviceVariableNode(owner: UAFolder, node: DeviceNode) {
        if (node.simulation) {
            this.validateMapping(node);
            new Simulator(this.namespace, node).simulateNodeValue();
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

    private constructNodeVariant(node: DeviceNode) {
        const valueBinding: {
            get: () => Variant | StatusCode;
            set: (variant: VariantT<number | boolean | string, DataType>) => StatusCode;
        } = {
            get: () => StatusCodes.BadNotReadable,
            set: () => StatusCodes.BadNotWritable,
        };

        if (node.valueMethods.includes('get')) {
            valueBinding.get = () => new Variant({
                dataType: this.inferValueType(node.value),
                value: node.value,
            });
        }

        if (node.valueMethods.includes('set')) {
            valueBinding.set = (variant) => {
                const newValue = variant.value as SimulationValue;
                const reverseResult = this.applyReverseMapping(node, newValue);
                if (reverseResult !== StatusCodes.Good) return reverseResult;

                node.value = newValue;
                return StatusCodes.Good;
            };
        }

        return valueBinding;
    }

    private validateMapping(node: DeviceNode) {
        const mapping = node.simulation?.mapping;
        if (!mapping?.bidirectional) return;

        const serializedValues = Object.values(mapping.map).map((value) => this.serializeMappingValue(value));
        if (new Set(serializedValues).size !== serializedValues.length) {
            throw new Error(`Bidirectional mapping for node ${node.id} contains duplicate output values`);
        }

        if (!this.nodeRegistry.has(mapping.source)) {
            throw new Error(`Mapping source node ${mapping.source} for node ${node.id} was not found`);
        }
    }

    private applyReverseMapping(node: DeviceNode, newValue: SimulationValue): StatusCode {
        const mapping = node.simulation?.mapping;
        if (!mapping?.bidirectional) return StatusCodes.Good;

        const matchingEntry = Object.entries(mapping.map).find(
            ([, mappedValue]) => this.valuesEqual(mappedValue, newValue)
        );

        if (!matchingEntry) {
            Logger.error(`Value ${newValue} is not valid for bidirectional mapping node ${node.id}`);
            return StatusCodes.BadOutOfRange;
        }

        const sourceNode = this.nodeRegistry.get(mapping.source);
        if (!sourceNode) return StatusCodes.BadNodeIdUnknown;

        sourceNode.value = this.convertMappingKey(matchingEntry[0], sourceNode.value);
        return StatusCodes.Good;
    }

    private convertMappingKey(key: string, sourceValue: SimulationValue): SimulationValue {
        if (typeof sourceValue === 'number') return Number(key);
        if (typeof sourceValue === 'boolean') return key === 'true';
        return key;
    }

    private valuesEqual(left: SimulationValue, right: SimulationValue) {
        return typeof left === typeof right && left === right;
    }

    private serializeMappingValue(value: SimulationValue) {
        return `${typeof value}:${String(value)}`;
    }

    private inferValueType(value: SimulationValue) {
        if (typeof value === 'string') return DataType.String;
        if (typeof value === 'number') return DataType.Double;
        if (typeof value === 'boolean') return DataType.Boolean;
        return DataType.Null;
    }
}
