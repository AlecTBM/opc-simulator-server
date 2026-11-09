import { DataType } from 'node-opcua';

export interface DeviceFolder {
    name: string;
    id: string;
    items: (DeviceFolder | DeviceNode)[];
}

export interface DeviceNode {
    id: string;
    name: string;
    type: DataType;
    value: number | string | boolean;
    valueMethods: ('set' | 'get')[];
    simulation?: {
        type: 'increase' | 'decrease' | 'randomize' | 'sinus' | 'anomaly';
        value: number;
        interval: number;
        randomize?: { min: number; max: number; base: number };
        sinus?: { amplitude: number, offset: number }
        anomaly?: { min: number; max: number; targetValue: boolean|string|number, threshold: number };
        dependsOn?: { nodeNs: string; value: string | boolean | number };
    };
}
