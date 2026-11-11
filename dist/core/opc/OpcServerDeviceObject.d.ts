import { OPCUAServer } from 'node-opcua';
import { DeviceFolder } from '../../../@types';
export default class ServerDeviceObject {
    private device;
    private namespace;
    private objectsFolder;
    private nodeRegistry;
    constructor(server: OPCUAServer, device: DeviceFolder);
    init(): void;
    private indexDeviceNodes;
    private registerDeviceNode;
    private registerDeviceFolderNode;
    private registerDeviceVariableNode;
    private constructNodeVariant;
    private validateMapping;
    private applyReverseMapping;
    private convertMappingKey;
    private valuesEqual;
    private serializeMappingValue;
    private inferValueType;
}
