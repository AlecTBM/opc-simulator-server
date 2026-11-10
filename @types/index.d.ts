import { DataType } from 'node-opcua';

export type SimulationValue = number | string | boolean;
export type ConditionOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';
export type ConditionLogic = 'AND' | 'OR';
export type CalculationOperator = 'add' | 'subtract' | 'multiply' | 'divide';
export type CalculationFunction = 'negate' | 'absolute' | 'round' | 'floor' | 'ceil' | 'sqrt';
export type SimulationLimits = { min?: number; max?: number };

export interface SimulationCondition { nodeNs: string; operator: ConditionOperator; value: SimulationValue; }
export interface ConditionDelay { on?: number; off?: number; }
export interface SimulationConditions { logic: ConditionLogic; items: SimulationCondition[]; delay?: ConditionDelay; }
export interface SimulationMapping { source: string; map: Record<string, SimulationValue>; defaultValue?: SimulationValue; bidirectional?: boolean; }
export type CalculationInput = { source: string } | { value: SimulationValue } | { previous: true };
export interface CalculationOperatorStep { operator: CalculationOperator; inputs: CalculationInput[]; }
export interface CalculationFunctionStep { function: CalculationFunction; input?: CalculationInput; }
export type CalculationStep = CalculationOperatorStep | CalculationFunctionStep;
export interface SimulationCalculation { steps: CalculationStep[]; limits?: SimulationLimits; precision?: number; }
export interface StateMachineTransition { from?: SimulationValue; to: SimulationValue; conditions?: SimulationConditions; delay?: number; priority?: number; }
export interface SimulationStateMachine { states: SimulationValue[]; transitions: StateMachineTransition[]; }
export interface SimulationCycle { onDuration: number; offDuration: number; onValue: SimulationValue; offValue: SimulationValue; inactiveValue?: SimulationValue; }

export type SelectSimulationType = 'increase' | 'decrease' | 'randomize' | 'sinus' | 'conditional' | 'mapping' | 'calculation' | 'cycle';
export interface SelectSimulation {
  type: SelectSimulationType;
  value?: number;
  trueValue?: SimulationValue;
  falseValue?: SimulationValue;
  randomize?: { min: number; max: number; base: number };
  sinus?: { amplitude: number; offset: number };
  mapping?: SimulationMapping;
  calculation?: SimulationCalculation;
  cycle?: SimulationCycle;
  limits?: SimulationLimits;
}
export interface SimulationSelectCase { conditions: SimulationConditions; simulation: SelectSimulation; }
export interface SimulationSelect { cases: SimulationSelectCase[]; default?: SelectSimulation; }

export interface DeviceFolder { name: string; id: string; items: (DeviceFolder | DeviceNode)[]; }
export interface DeviceNode {
  id: string; name: string; type: DataType; value: SimulationValue; valueMethods: ('set' | 'get')[];
  simulation?: {
    type: 'increase'|'decrease'|'randomize'|'sinus'|'anomaly'|'conditional'|'mapping'|'calculation'|'stateMachine'|'cycle'|'select';
    value?: number; interval: number; conditions?: SimulationConditions; limits?: SimulationLimits;
    trueValue?: SimulationValue; falseValue?: SimulationValue;
    randomize?: { min: number; max: number; base: number };
    sinus?: { amplitude: number; offset: number };
    anomaly?: { min: number; max: number; targetValue: SimulationValue; threshold: number; duration: number; ends?: boolean };
    mapping?: SimulationMapping; calculation?: SimulationCalculation; stateMachine?: SimulationStateMachine; cycle?: SimulationCycle; select?: SimulationSelect;
  };
}
