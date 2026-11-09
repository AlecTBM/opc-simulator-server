import { Namespace, AttributeIds } from 'node-opcua';
import { DeviceNode, SimulationCondition, SimulationValue } from '../../../@types';
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

        case 'increase':
        case 'decrease':
        case 'randomize':
        case 'sinus':
          if (this.conditionsSatisfied()) {
            this.runSimulation(simulation.type);
          }
          break;
      }

      if (this.t > 3200) this.t = 1;
    }, (simulation.interval || 1) * 1000);
  }

  private runSimulation(type: 'increase' | 'decrease' | 'randomize' | 'sinus') {
    switch (type) {
      case 'increase':
        this.increase();
        break;
      case 'decrease':
        this.decrease();
        break;
      case 'randomize':
        this.randomize();
        break;
      case 'sinus':
        this.sinus();
        break;
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
      case '==':
        return actualValue === condition.value;
      case '!=':
        return actualValue !== condition.value;
      case '<':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a < b, condition);
      case '<=':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a <= b, condition);
      case '>':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a > b, condition);
      case '>=':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a >= b, condition);
      default:
        return false;
    }
  }

  private compareNumbers(
    actualValue: SimulationValue,
    expectedValue: SimulationValue,
    compare: (actual: number, expected: number) => boolean,
    condition: SimulationCondition
  ): boolean {
    if (typeof actualValue !== 'number' || typeof expectedValue !== 'number') {
      Logger.error(
        `Operator ${condition.operator} requires numeric values for node ${condition.nodeNs}`
      );
      return false;
    }

    return compare(actualValue, expectedValue);
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
      if (!this.conditionsSatisfied()) {
        return;
      }

      if (anomalyActive) {
        const activeSeconds = (Date.now() - anomalyStartedAt) / 1000;
        if (activeSeconds >= config.duration) {
          this.node.value = normalValue;
          anomalyActive = false;
          elapsed = 0;
          Logger.debug(
            `[Node ${this.node.id}]: Anomaly ended after ${config.duration}s. Restored value to ${normalValue}`
          );
        }
        return;
      }

      elapsed += simulation.interval;

      if (elapsed < config.min) {
        return;
      }

      const reachedMaxTime = elapsed >= config.max;
      const progress = Math.min(1, (elapsed - config.min) / Math.max(1, config.max - config.min));
      const shouldTrigger = reachedMaxTime || Math.random() + progress > 1 + config.threshold;

      if (shouldTrigger) {
        this.node.value = config.targetValue;
        anomalyActive = true;
        anomalyStartedAt = Date.now();
        Logger.debug(
          `[Node ${this.node.id}]: Anomaly triggered. Set value to ${config.targetValue} for ${config.duration}s`
        );
      }
    }, simulation.interval * 1000);
  }

  private getNodeValue(nodeNs: string): SimulationValue | undefined {
    return this.namespace.findNode(nodeNs)?.readAttribute(null, AttributeIds.Value).value.value;
  }
}
