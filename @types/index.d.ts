import { DataType } from 'node-opcua';

export type SimulationValue = number | string | boolean;
export type ConditionOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';
export type ConditionLogic = 'AND' | 'OR';

export interface SimulationCondition {
    nodeNs: string;
    operator: ConditionOperator;
    value: SimulationValue;
}

export interface SimulationConditions {
    logic: ConditionLogic;
    items: SimulationCondition[];
}

export interface DeviceFolder {
    name: string;
    id: string;
    items: (DeviceFolder | DeviceNode)[];
}

export interface DeviceNode {
    id: string;
    name: string;
    type: DataType;
    value: SimulationValue;
    valueMethods: ('set' | 'get')[];
    simulation?: {
        type: 'increase' | 'decrease' | 'randomize' | 'sinus' | 'anomaly' | 'conditional';
        value?: number;
        interval: number;
        conditions?: SimulationConditions;
        trueValue?: SimulationValue;
        falseValue?: SimulationValue;
        randomize?: { min: number; max: number; base: number };
        sinus?: { amplitude: number; offset: number };
        anomaly?: {
            min: number;
            max: number;
            targetValue: SimulationValue;
            threshold: number;
            ends?: boolean;
        };
    };
}
