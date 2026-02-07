export interface RunEconomyState {
  supplies: number;
  intel: number;
  reputationTokens: number;
}

export class EconomySystem {
  private state: RunEconomyState = {
    supplies: 30,
    intel: 0,
    reputationTokens: 0,
  };

  resetRun(): void {
    this.state.supplies = 30;
    this.state.intel = 0;
    this.state.reputationTokens = 0;
  }

  getState(): RunEconomyState {
    return { ...this.state };
  }

  applyState(state: RunEconomyState): void {
    this.state.supplies = Math.max(0, Math.round(state.supplies));
    this.state.intel = Math.max(0, Math.round(state.intel));
    this.state.reputationTokens = Math.max(0, Math.round(state.reputationTokens));
  }

  addSupplies(amount: number): void {
    this.state.supplies = Math.max(0, this.state.supplies + amount);
  }

  addIntel(amount: number): void {
    this.state.intel = Math.max(0, this.state.intel + amount);
  }

  addReputationTokens(amount: number): void {
    this.state.reputationTokens = Math.max(0, this.state.reputationTokens + amount);
  }

  spendSupplies(cost: number): boolean {
    if (this.state.supplies < cost) return false;
    this.state.supplies -= cost;
    return true;
  }
}
