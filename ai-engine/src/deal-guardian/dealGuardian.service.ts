/**
 * dealGuardian.service.ts
 *
 * AI Deal Guardian contract analysis service.
 *
 * Architecture:
 *
 * Contract
 *    ↓
 * Groq GPT-OSS 20B
 *    ↓
 * AI identifies risky clauses + severity
 *    ↓
 * Zod validates AI output
 *    ↓
 * Backend calculates risk score
 *    ↓
 * Backend determines risk level
 *    ↓
 * Final ContractAnalysis
 */

import OpenAI from "openai";

import {
  ContractAnalysis,
  FlaggedClause,
  RiskLevel,
  parseAIContractAnalysis,
} from "./dealGuardian.schema";

import {
  DEAL_GUARDIAN_SYSTEM_PROMPT,
  buildDealGuardianUserPrompt,
} from "./prompts";

export interface DealGuardianServiceOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  [key: string]: unknown;
}

export class DealGuardianService {
  private client: OpenAI;
  private model: string;

  constructor(options: DealGuardianServiceOptions = {}) {
    const apiKey =
      options.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL:
        options.baseURL ||
        "https://api.groq.com/openai/v1",
    });

    this.model =
      options.model ||
      process.env.GROQ_MODEL ||
      "openai/gpt-oss-20b";
  }

  async analyzeContract(
    contractText: string
  ): Promise<ContractAnalysis> {
    if (!contractText || !contractText.trim()) {
      throw new Error(
        "Contract text must not be empty"
      );
    }

    const completion =
      await this.client.chat.completions.create({
        model: this.model,

        temperature: 0,

        /*
         * GPT-OSS is a reasoning model.
         *
         * Low reasoning keeps it from spending the
         * entire completion analyzing the contract
         * internally before producing the JSON.
         */
        reasoning_effort: "low",

        /*
         * Give the model enough room for the final
         * JSON response.
         */
        max_completion_tokens: 5000,

        /*
         * Ask Groq to return structured JSON.
         *
         * GPT-OSS 20B supports structured outputs.
         */
        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content:
              DEAL_GUARDIAN_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content:
              buildDealGuardianUserPrompt(
                contractText
              ),
          },
        ],
      });

    const choice = completion.choices[0];
    const message = choice?.message;

    console.log(
      "AI Deal Guardian completion:",
      {
        model: this.model,
        finishReason:
          choice?.finish_reason,
        hasContent:
          Boolean(message?.content),
        contentLength:
          message?.content?.length ?? 0,
      }
    );

    const rawContent = message?.content;

    if (!rawContent || !rawContent.trim()) {
      console.error(
        "AI Deal Guardian empty response:",
        {
          model: this.model,
          finishReason:
            choice?.finish_reason,
          message,
        }
      );

      throw new Error(
        "AI Deal Guardian returned an empty response"
      );
    }

    const cleanedContent =
      this.cleanJsonResponse(rawContent);

    const aiAnalysis =
      parseAIContractAnalysis(
        cleanedContent
      );

    /*
     * IMPORTANT:
     *
     * The AI does NOT decide the final score.
     * The backend calculates it deterministically
     * from the severity of the flagged clauses.
     */
    const safetyScore =
      this.calculateRiskScore(
        aiAnalysis.flaggedClauses
      );

    const riskLevel =
      this.calculateRiskLevel(
        safetyScore
      );

    return {
      riskLevel,
      safetyScore,
      summary: aiAnalysis.summary,
      flaggedClauses:
        aiAnalysis.flaggedClauses,
      recommendations:
        aiAnalysis.recommendations,
    };
  }

  /**
   * Removes Markdown code fences if the model
   * accidentally returns:
   *
   * ```json
   * {...}
   * ```
   */
  private cleanJsonResponse(
    content: string
  ): string {
    let cleaned = content.trim();

    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }

    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(
        0,
        -3
      );
    }

    return cleaned.trim();
  }

  /**
   * Converts clause severity into a deterministic
   * risk score.
   *
   * Higher score = higher risk.
   */
  private calculateRiskScore(
    flaggedClauses: FlaggedClause[]
  ): number {
    if (flaggedClauses.length === 0) {
      return 0;
    }

    const severityPoints: Record<
      RiskLevel,
      number
    > = {
      LOW: 5,
      MEDIUM: 15,
      HIGH: 25,
      CRITICAL: 40,
    };

    let score = 0;

    for (const clause of flaggedClauses) {
      score +=
        severityPoints[
          clause.severity
        ];
    }

    const hasCritical =
      flaggedClauses.some(
        (clause) =>
          clause.severity ===
          "CRITICAL"
      );

    const hasHigh =
      flaggedClauses.some(
        (clause) =>
          clause.severity ===
          "HIGH"
      );

    /*
     * A CRITICAL clause guarantees that the
     * overall contract cannot be classified
     * below CRITICAL.
     */
    if (hasCritical) {
      score = Math.max(
        score,
        75
      );
    } else if (hasHigh) {
      /*
       * At least one HIGH issue means the
       * contract cannot be classified as LOW.
       */
      score = Math.max(
        score,
        50
      );
    }

    return Math.min(
      100,
      score
    );
  }

  /**
   * Converts the score into the final
   * contract risk level.
   */
  private calculateRiskLevel(
    score: number
  ): RiskLevel {
    if (score >= 75) {
      return "CRITICAL";
    }

    if (score >= 50) {
      return "HIGH";
    }

    if (score >= 25) {
      return "MEDIUM";
    }

    return "LOW";
  }
}

export default new DealGuardianService();