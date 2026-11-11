import { OPCUAServer } from 'node-opcua';
import ServerDeviceObject from './OpcServerDeviceObject';
import { DeviceFolder } from '../../../@types';
import Logger from '../utils/Logger';

export default class OpcServer {
    private server: OPCUAServer;
    private devices: Record<string, DeviceFolder>;

    constructor(
        devices: Record<string, DeviceFolder>,
        {
            port,
        }: {
            port: number;
        } = {
            port: 4840,
        },
    ) {
        const alternateHostname = [
            process.env.OPCUA_HOST_IP,
            'opc-simulator',
        ].filter((hostname): hostname is string => Boolean(hostname));

        Logger.info(`OPC UA alternate hostnames: ${alternateHostname.join(', ')}`);

        this.server = new OPCUAServer({
            port: port || 4840,
            resourcePath: '/UA/Cpro',
            alternateHostname,
            buildInfo: {
                productName: 'Cpro OPC UA Server',
                buildNumber: '1.0.0',
                buildDate: new Date(),
            },
        });

        this.devices = devices;

        this.server.on('post_initialize', () => {
            for (const device in this.devices) {
                const deviceObject: DeviceFolder = devices[device];
                this.printDeviceFolderStructure(deviceObject);
                new ServerDeviceObject(this.server, deviceObject).init();
            }
        });
    }

    public async start() {
        try {
            await this.server.initialize();
            await this.server.start();
            Logger.info('OPC UA server started successfully');
        } catch (error) {
            Logger.error('Failed to start OPC UA server', error);
            process.exit(1);
        }
    }

    private printDeviceFolderStructure(folder: DeviceFolder) {
        Logger.info(`📁 ${folder.name} [Folder]`);
        folder.items.forEach((item, index) => {
            if (item.hasOwnProperty('items')) {
                this.printDeviceFolderStructure(item as DeviceFolder);
            } else if (index === folder.items.length - 1) {
                Logger.info(`└─ ${item.name} [Variable]`);
                Logger.info(``);
            } else {
                Logger.info(`├─ ${item.name} [Variable]`);
            }
        });
    }
}
