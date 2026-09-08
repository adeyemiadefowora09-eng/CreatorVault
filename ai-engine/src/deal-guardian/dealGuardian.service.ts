/**
 * dealGuardian.service.ts
 * Calls OpenAI's gpt-4o to produce a contract risk analysis, validates the
 * response against the strict schema, and retries once on malformed output.
 */

import OpenAI from "openai";
import { ContractAnalysis, parseContractAnalysis } from "./dealGuardian.schema";
import { DEAL_GUARDIAN_SYSTEM_PROMPT, buildDealGuardianUserPrompt } from "./prompts";

export interface DealGuardianServiceOptions {
  /** Defaults to reading OPENAI_API_KEY from the environment if omitted. */
  apiKey?: string;
  model?: string;
  /** Max attempts if the model returns invalid JSON / fails schema validation. Default 2. */
  maxAttempts?: number;
}

export class DealGuardianService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxAttempts: number;

  constructor(options: DealGuardianServiceOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set and no apiKey was provided to DealGuardianService");
    }
    this.client = new OpenAI({ apiKey });
    this.model = options.model ?? "gpt-4o";
    this.maxAttempts = options.maxAttempts ?? 2;
  }

  /**
   * Runs the risk analysis for a given contract's extracted text.
   * Text extraction from the uploaded file happens upstream (backend/contracts module);
   * this service only ever deals with plain text.
   */
  async analyzeContract(contractText: string): Promise<ContractAnalysis> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: DEAL_GUARDIAN_SYSTEM_PROMPT },
            { role: "user", content: buildDealGuardianUserPrompt(contractText) },
          ],
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
          throw new Error("Empty response from gpt-4o");
        }

        return parseContractAnalysis(raw);
      } catch (err) {
        lastError = err;
        // Only retry on parse/validation failures, not on network/auth errors.
        if (!(err instanceof Error) || attempt === this.maxAttempts) {
          break;
        }
      }
    }

    throw new Error(
      `AI Deal Guardian failed to produce a valid analysis after ${this.maxAttempts} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }
}
