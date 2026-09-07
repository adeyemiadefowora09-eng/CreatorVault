import dotenv from "dotenv";
dotenv.config();

export async function analyzeContract(text: string) {
  const prompt = `
Analyze the following contract for a creator/brand deal.
Return a JSON object with this exact structure:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskScore": number between 0 and 100,
  "summary": "Short summary of the contract risks",
  "flaggedClauses": [
    {
      "clause": "The problematic text snippet",
      "risk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "category": "PAYMENT_TERMS" | "IP_RIGHTS" | "EXCLUSIVITY" | "TERMINATION" | "LIABILITY",
      "explanation": "Why this is flagged",
      "suggestion": "How to negotiate or fix it"
    }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"]
}

Contract Text:
${text}
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error("OpenAI API error");
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (err: any) {
    throw new Error(`Failed to analyze contract with AI Deal Guardian: ${err.message}`);
  }
}
