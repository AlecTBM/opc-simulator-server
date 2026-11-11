/// <reference types="node" />
import { EventEmitter } from 'node:events';
import { DeviceFolder } from '../../@types';
export default class Runtime extends EventEmitter {
    private devices;
    private OpcServer;
    private Validator;
    constructor({ devices, devicesSchema }: {
        devices: Record<string, DeviceFolder>;
        devicesSchema: object;
    });
    init(): Promise<void>;
}
