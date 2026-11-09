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
      if (simulation.type === 'conditional') {
        this.conditional();
      } else if (this.conditionsSatisfied()) {
        this.runSimulation(simulation.type);
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
    const anomalyDetectionInterval = 10000;
    let anomalyInterval: ReturnType<typeof setInterval>;
    let isActive = true;

    const runAnomaly = () => {
      if (!this.conditionsSatisfied()) return;
      if (this.t > 3200) this.t = 1;

      const config = this.node.simulation?.anomaly;
      if (!config) return;

      const belowMinTime = this.t <= config.min;
      const reachedMaxTime = this.t >= config.max;
      const betweenMinAndMax = !belowMinTime && !reachedMaxTime;

      const increaseTimePassed = () => {
        Logger.debug(`[Node ${this.node.id}]: Time passed: ${this.t} / ${config.max}`);
        this.t++;
      };

      const setAnomalyValue = () => {
        this.node.value = config.targetValue;
        Logger.debug(`[Node ${this.node.id}]: Conditions for anomaly met. Set node value to ${this.node.value}`);
        this.t = 0;
      };

      const stopAnomalySimulation = () => {
        Logger.debug(`[Node ${this.node.id}]: Already set to anomaly value: ${this.node.value}`);
        isActive = false;
        clearInterval(anomalyInterval);
      };

      if (this.node.value === config.targetValue) {
        stopAnomalySimulation();
        return;
      }

      if (betweenMinAndMax) {
        const relativeTimePassed = this.t / config.max;
        const chanceToTrigger = Math.random() * (Math.random() - relativeTimePassed) + relativeTimePassed;
        Logger.debug(`[Node ${this.node.id}]: Chance to trigger anomaly: ${chanceToTrigger}`);
        if (chanceToTrigger > (config.threshold || 0.85)) setAnomalyValue();
        else increaseTimePassed();
      } else if (belowMinTime) {
        increaseTimePassed();
      } else if (reachedMaxTime) {
        setAnomalyValue();
      }
    };

    anomalyInterval = setInterval(runAnomaly, (this.node.simulation?.interval || 1) * 1000);

    setInterval(() => {
      if (!isActive) {
        Logger.debug(`[Node ${this.node.id}]: Checking if anomaly should be triggered for node with id: "${this.node.id}"`);
        isActive = true;
        clearInterval(anomalyInterval);
        anomalyInterval = setInterval(runAnomaly, (this.node.simulation?.interval || 1) * 1000);
      }
    }, anomalyDetectionInterval);
  }

  private getNodeValue(nodeNs: string): SimulationValue | undefined {
    return this.namespace.findNode(nodeNs)?.readAttribute(null, AttributeIds.Value).value.value;
  }
}
