import { DeviceFolder } from '../../../@types';
export default class OpcServer {
    private server;
    private devices;
    constructor(devices: Record<string, DeviceFolder>, { port, }?: {
        port: number;
    });
    start(): Promise<void>;
    private printDeviceFolderStructure;
}
