import { Namespace, AttributeIds } from 'node-opcua';
import { DeviceNode } from '../../../@types';
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
    const { type } = this.node.simulation || { type: 'increase' };

    if (type !== 'anomaly') {
      setInterval(() => {
        if (!this.dependenciesSatisfied()) {
          return;
        }

        this[type]();

        if (this.t > 3200) this.t = 1;
      }, (this.node.simulation?.interval || 1) * 1000);
    } else {
      this.anomaly();
    }
  }

  private dependenciesSatisfied(): boolean {
    const dependency = this.node.simulation?.dependsOn;

    if (!dependency) {
      return true;
    }

    const { nodeNs, value: expectedValue } = dependency;

    if (!nodeNs) {
      Logger.error('Namespace of depending node missing');
      return false;
    }

    const dependingNodeValue = this.getNodeValue(nodeNs);

    if (dependingNodeValue === undefined || dependingNodeValue === null) {
      Logger.error(`Node with namespace ${nodeNs} not found`);
      return false;
    }

    if (dependingNodeValue === expectedValue) {
      Logger.debug(
        `[Node ${this.node.id}]: Observed value of node "${nodeNs}"->'${dependingNodeValue}' is equal to '${expectedValue}'.`
      );
      return true;
    }

    return false;
  }

  private increase() {
    if (!(typeof this.node.value === 'number')) {
      Logger.error("Can't increase non number value");
      return;
    }

    (this.node.value as number) += (this.node.simulation?.value || 1);
  }

  private decrease() {
    if (!(typeof this.node.value === 'number')) {
      Logger.error("Can't decrease non number value");
      return;
    }

    (this.node.value as number) -= (this.node.simulation?.value || 1);
  }

  private randomize() {
    const base = this.node.simulation?.randomize?.base || 0;
    const min = Math.random() * (this.node.simulation?.randomize?.max || 1);
    const max = Math.random() * (this.node.simulation?.randomize?.min || 1);
    this.node.value = +(base as number + min - max).toFixed(2);
  }

  private sinus() {
    const _sinus = () => {
      const sinus = +(this.node.simulation?.sinus?.amplitude || 1) * Math.sin(this.t / 50);
      const offset = +(this.node.simulation?.sinus?.offset || 0);
      this.node.value = +(sinus + offset).toFixed(2);
      this.t++;
    };
    _sinus();
  }

  private anomaly() {
    const anomalyDetectionInterval = 10000;
    let anomalyInterval: ReturnType<typeof setInterval>;
    let isActive = true;

    const _anomaly = () => {
      if (this.t > 3200) this.t = 1;

      const belowMinTime = this.t <= +(this.node.simulation?.anomaly?.min || 5);
      const reachedMaxTime = this.t >= +(this.node.simulation?.anomaly?.max || 30);
      const betweenMinAndMax = !belowMinTime && !reachedMaxTime;

      const _increaseTimePassed = () => {
        Logger.debug(`[Node ${this.node.id}]: Time passed: ${this.t} / ${this.node.simulation?.anomaly?.max || 1}`);
        this.t++;
      };

      const _setAnomalyValue = () => {
        this.node.value = this.node.simulation?.anomaly?.targetValue as boolean | string | number;
        Logger.debug(`[Node ${this.node.id}]: Conditions for anomaly met. Set node value to ${this.node.value}`);
        this.t = 0;
      };

      const _handleBetweenMixAndMax = () => {
        const relativeTimePassed = this.t / (this.node.simulation?.anomaly?.max || 1);
        const chanceToTrigger = (Math.random() * (Math.random() - relativeTimePassed)) + relativeTimePassed;
        Logger.debug(`[Node ${this.node.id}]: Chance to trigger anomaly: ${chanceToTrigger}`);
        if (chanceToTrigger > (this.node.simulation?.anomaly?.threshold || 0.85)) {
          _setAnomalyValue();
        } else {
          _increaseTimePassed();
        }
      };

      const _stopAnomalySimulation = () => {
        Logger.debug(`[Node ${this.node.id}]: Already set to anomaly value: ${this.node.value}`);
        isActive = false;
        clearInterval(anomalyInterval);
      };

      if (this.node.value === this.node.simulation?.anomaly?.targetValue) {
        _stopAnomalySimulation();
        return;
      }

      if (betweenMinAndMax) {
        _handleBetweenMixAndMax();
      } else if (belowMinTime) {
        _increaseTimePassed();
      } else if (reachedMaxTime) {
        _setAnomalyValue();
      }
    };

    anomalyInterval = setInterval(_anomaly, (this.node.simulation?.interval || 1) * 1000);

    setInterval(() => {
      if (!isActive) {
        Logger.debug(`[Node ${this.node.id}]: Checking if anomaly should be triggered for node with id: "${this.node.id}"`);
        clearInterval(anomalyInterval);
        anomalyInterval = setInterval(_anomaly, (this.node.simulation?.interval || 1) * 1000);
      }
    }, anomalyDetectionInterval);
  }

  private getNodeValue(nodeNs: string) {
    return this.namespace.findNode(nodeNs)?.readAttribute(null, AttributeIds.Value).value.value;
  }
}
