export class PlayerAnalyticsGenerationInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerAnalyticsGenerationInvalidError";
  }
}
