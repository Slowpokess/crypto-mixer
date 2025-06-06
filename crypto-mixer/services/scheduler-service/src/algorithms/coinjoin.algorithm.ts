export class CoinJoinAlgorithm {
  public async createTransaction(participants: any[], currency: string): Promise<any> {
    const amount = participants[0].amount;
    if (!participants.every(p => p.amount === amount)) {
      throw new Error('All CoinJoin participants must have same amount');
    }

    const inputs = participants.map(p => ({
      address: p.deposit_address,
      amount: p.total_amount,
      mixRequestId: p.id,
    }));

    const outputs = [];
    for (const participant of participants) {
      const outputAddresses = JSON.parse(participant.output_addresses);
      for (const output of outputAddresses) {
        outputs.push({
          address: output.address,
          amount: (amount * output.percentage) / 100,
          mixRequestId: participant.id,
        });
      }
    }

    this.shuffleArray(outputs);

    return {
      id: this.generateTransactionId(),
      currency,
      inputs,
      outputs,
      participants: participants.map(p => p.id),
      created_at: new Date(),
    };
  }

  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private generateTransactionId(): string {
    return 'cj-' + Date.now() + '-' + Math.random().toString(36).substring(2);
  }
}