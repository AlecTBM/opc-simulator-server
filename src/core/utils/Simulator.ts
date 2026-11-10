import { Namespace, AttributeIds } from 'node-opcua';
import {
  CalculationInput,
  CalculationStep,
  DeviceNode,
  SimulationCondition,
  SimulationValue,
} from '../../../@types';
import Logger from './Logger';

export default class Simulator {
  namespace: Namespace;
  node: DeviceNode;
  t: number;

  constructor(namespace: Namespace, node: DeviceNode) {
    this.namespace = namespace;
    this.node = node;
    this.t = 1;
  }

  public simulateNodeValue() {
    const simulation = this.node.simulation;
    if (!simulation) return;

    if (simulation.type === 'anomaly') {
      this.anomaly();
      return;
    }

    setInterval(() => {
      switch (simulation.type) {
        case 'conditional':
          this.conditional();
          break;
        case 'mapping':
          if (this.conditionsSatisfied()) this.mapping();
          break;
        case 'calculation':
          if (this.conditionsSatisfied()) this.calculation();
          break;
        case 'increase':
        case 'decrease':
        case 'randomize':
        case 'sinus':
          if (this.conditionsSatisfied()) this.runSimulation(simulation.type);
          break;
      }

      if (this.t > 3200) this.t = 1;
    }, (simulation.interval || 1) * 1000);
  }

  private runSimulation(type: 'increase' | 'decrease' | 'randomize' | 'sinus') {
    switch (type) {
      case 'increase': this.increase(); break;
      case 'decrease': this.decrease(); break;
      case 'randomize': this.randomize(); break;
      case 'sinus': this.sinus(); break;
    }
  }

  private conditionsSatisfied(): boolean {
    const conditions = this.node.simulation?.conditions;
    if (!conditions) return true;
    if (!conditions.items.length) return false;

    const results = conditions.items.map((condition) => this.evaluateCondition(condition));
    return conditions.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(condition: SimulationCondition): boolean {
    const actualValue = this.getNodeValue(condition.nodeNs);
    if (actualValue === undefined || actualValue === null) {
      Logger.error(`Node with namespace ${condition.nodeNs} not found`);
      return false;
    }

    switch (condition.operator) {
      case '==': return actualValue === condition.value;
      case '!=': return actualValue !== condition.value;
      case '<': return this.compareNumbers(actualValue, condition.value, (a, b) => a < b, condition);
      case '<=': return this.compareNumbers(actualValue, condition.value, (a, b) => a <= b, condition);
      case '>': return this.compareNumbers(actualValue, condition.value, (a, b) => a > b, condition);
      case '>=': return this.compareNumbers(actualValue, condition.value, (a, b) => a >= b, condition);
      default: return false;
    }
  }

  private compareNumbers(
    actualValue: SimulationValue,
    expectedValue: SimulationValue,
    compare: (actual: number, expected: number) => boolean,
    condition: SimulationCondition
  ): boolean {
    if (typeof actualValue !== 'number' || typeof expectedValue !== 'number') {
      Logger.error(`Operator ${condition.operator} requires numeric values for node ${condition.nodeNs}`);
      return false;
    }
    return compare(actualValue, expectedValue);
  }

  private mapping() {
    const config = this.node.simulation?.mapping;
    if (!config) return;

    const sourceValue = this.getNodeValue(config.source);
    if (sourceValue === undefined || sourceValue === null) {
      Logger.error(`Mapping source node ${config.source} not found`);
      return;
    }

    const key = String(sourceValue);
    if (Object.prototype.hasOwnProperty.call(config.map, key)) {
      this.node.value = config.map[key];
    } else if (config.defaultValue !== undefined) {
      this.node.value = config.defaultValue;
    }
  }

  private calculation() {
    const config = this.node.simulation?.calculation;
    if (!config?.steps.length) return;

    let previous: number | undefined;
    for (const step of config.steps) {
      previous = this.executeCalculationStep(step, previous);
    }

    let result = this.safeNumber(previous);
    if (config.limits?.min !== undefined) result = Math.max(config.limits.min, result);
    if (config.limits?.max !== undefined) result = Math.min(config.limits.max, result);
    if (config.precision !== undefined) {
      const factor = 10 ** config.precision;
      result = Math.round(result * factor) / factor;
    }

    this.node.value = this.safeNumber(result);
  }

  private executeCalculationStep(step: CalculationStep, previous?: number): number {
    if ('operator' in step) {
      const values = step.inputs.map((input) => this.resolveCalculationInput(input, previous));
      switch (step.operator) {
        case 'add': return this.safeNumber(values.reduce((a, b) => a + b, 0));
        case 'subtract': return this.safeNumber(values.slice(1).reduce((a, b) => a - b, values[0]));
        case 'multiply': return this.safeNumber(values.reduce((a, b) => a * b, 1));
        case 'divide':
          return this.safeNumber(values.slice(1).reduce((a, b) => b === 0 ? 0 : a / b, values[0]));
      }
    }

    const input = step.input ? this.resolveCalculationInput(step.input, previous) : this.safeNumber(previous);
    switch (step.function) {
      case 'negate': return this.safeNumber(-input);
      case 'absolute': return this.safeNumber(Math.abs(input));
      case 'round': return this.safeNumber(Math.round(input));
      case 'floor': return this.safeNumber(Math.floor(input));
      case 'ceil': return this.safeNumber(Math.ceil(input));
      case 'sqrt': return input < 0 ? 0 : this.safeNumber(Math.sqrt(input));
    }
  }

  private resolveCalculationInput(input: CalculationInput, previous?: number): number {
    if ('previous' in input) return this.safeNumber(previous);
    if ('source' in input) return this.toNumber(this.getNodeValue(input.source));
    return this.toNumber(input.value);
  }

  private toNumber(value: SimulationValue | undefined): number {
    if (typeof value === 'number') return this.safeNumber(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
      if (value.trim() === '') return 0;
      return this.safeNumber(Number(value));
    }
    return 0;
  }

  private safeNumber(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private conditional() {
    const simulation = this.node.simulation;
    if (!simulation) return;
    this.node.value = this.conditionsSatisfied()
      ? simulation.trueValue as SimulationValue
      : simulation.falseValue as SimulationValue;
  }

  private increase() {
    if (typeof this.node.value !== 'number') {
      Logger.error("Can't increase non number value");
      return;
    }
    this.node.value += this.node.simulation?.value || 1;
  }

  private decrease() {
    if (typeof this.node.value !== 'number') {
      Logger.error("Can't decrease non number value");
      return;
    }
    this.node.value -= this.node.simulation?.value || 1;
  }

  private randomize() {
    const config = this.node.simulation?.randomize;
    if (!config) return;
    const up = Math.random() * config.max;
    const down = Math.random() * config.min;
    this.node.value = +(config.base + up - down).toFixed(2);
  }

  private sinus() {
    const config = this.node.simulation?.sinus;
    if (!config) return;
    this.node.value = +(config.amplitude * Math.sin(this.t / 50) + config.offset).toFixed(2);
    this.t++;
  }

  private anomaly() {
    const simulation = this.node.simulation;
    const config = simulation?.anomaly;
    if (!simulation || !config) return;

    const normalValue = this.node.value;
    let anomalyActive = false;
    let anomalyStartedAt = 0;
    let elapsed = 0;

    setInterval(() => {
      if (!this.conditionsSatisfied()) return;

      if (anomalyActive) {
        const activeSeconds = (Date.now() - anomalyStartedAt) / 1000;
        if (activeSeconds >= config.duration) {
          this.node.value = normalValue;
          anomalyActive = false;
          elapsed = 0;
          Logger.debug(`[Node ${this.node.id}]: Anomaly ended. Restored value to ${normalValue}`);
        }
        return;
      }

      elapsed += simulation.interval;
      if (elapsed < config.min) return;

      const reachedMaxTime = elapsed >= config.max;
      const progress = Math.min(1, (elapsed - config.min) / Math.max(1, config.max - config.min));
      const shouldTrigger = reachedMaxTime || Math.random() + progress > 1 + config.threshold;

      if (shouldTrigger) {
        this.node.value = config.targetValue;
        anomalyActive = true;
        anomalyStartedAt = Date.now();
        Logger.debug(`[Node ${this.node.id}]: Anomaly triggered for ${config.duration}s`);
      }
    }, simulation.interval * 1000);
  }

  private getNodeValue(nodeNs: string): SimulationValue | undefined {
    return this.namespace.findNode(nodeNs)?.readAttribute(null, AttributeIds.Value).value.value;
  }
}
