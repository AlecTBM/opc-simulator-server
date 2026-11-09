import { Namespace, OPCUAServer, UAFolder, DataType, UAObjectsFolder, Variant, StatusCodes, StatusCode, VariantT, AttributeIds } from 'node-opcua';
import { DeviceFolder, DeviceNode } from '../../../@types';
import Logger from '../utils/Logger';
import Simulator from '../utils/Simulator';

export default class ServerDeviceObject {
    private device: DeviceFolder;
    private namespace: Namespace;
    private objectsFolder: UAObjectsFolder;

    constructor(server: OPCUAServer, device: DeviceFolder) {
        this.device = device;
        this.namespace = server.engine.addressSpace?.getOwnNamespace() as Namespace;
        this.objectsFolder = server.engine.addressSpace?.rootFolder.objects as UAObjectsFolder;
    }

    public init() {
        const deviceRootFolder = this.registerDeviceFolderNode(this.objectsFolder, this.device);
        this.device.items.forEach((node: DeviceFolder | DeviceNode) => {
            this.registerDeviceNode(deviceRootFolder, node);
        });
    }

    private registerDeviceNode(owner: UAFolder, node: DeviceFolder | DeviceNode) {
        const isFolder = node.hasOwnProperty('items');
        if (isFolder) {
            const deviceSubFolder = this.registerDeviceFolderNode(owner, node as DeviceFolder);
            (node as DeviceFolder).items.forEach((item) => this.registerDeviceNode(deviceSubFolder, item));
        } else {
            this.registerDeviceVariableNode(owner, node as DeviceNode);
        }
    }

    private registerDeviceFolderNode(owner: UAFolder, folder: DeviceFolder) {
        return this.namespace.addFolder(owner, { browseName: folder.name });
    }

    private registerDeviceVariableNode(owner: UAFolder, node: DeviceNode) {
        let _variableValue = node.value;

        if (node.simulation) {
            new Simulator(this.namespace, node).simulateNodeValue();
        }

        return this.namespace.addVariable({
            componentOf: owner,
            nodeId: node.id,
            browseName: node.name,
            dataType: this.inferValueType(node.value),
            minimumSamplingInterval: 250,
            value: this.constructNodeVariant(node, _variableValue),
        });
    }

    private constructNodeVariant(node: DeviceNode, value: string | number | boolean) {
        let _value: { get: () => Variant | StatusCode; set: (variant: VariantT<number | boolean | string, DataType>) => Variant | StatusCode } = {
            get: () => StatusCodes.BadNotReadable,
            set: () => StatusCodes.BadNotWritable,
        };

        if (node.valueMethods.includes('get')) {
            _value.get = () => new Variant({ dataType: this.inferValueType(node.value), value: node.value });
        }

        if (node.valueMethods.includes('set')) {
            _value.set = (variant: VariantT<number | boolean | string, DataType>) => {
                node.value = variant.value;
                return StatusCodes.Good;
            };
        }

        return _value;
    }

    private inferValueType(value: string | number | boolean) {
        if (typeof value === 'string') return DataType.String;
        if (typeof value === 'number') return DataType.Double;
        if (typeof value === 'boolean') return DataType.Boolean;

        return DataType.Null;
    }

    private getNodeValue(nodeNs: string) {
        return (this.namespace.findNode(nodeNs)?.readAttribute(null, AttributeIds.Value).value.value)
    }
}
