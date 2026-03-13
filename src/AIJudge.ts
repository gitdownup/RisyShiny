// Paste your generated Cloudflare URL here (No trailing slash!)
const OLLAMA_TUNNEL_URL = "https://wwwrisyshiny.com";

interface AIJudgeResult {
    score: number;
    reasoning: string;
    glitchScore: number;
    AIExecuted: boolean;
    erroneousAIResponse?: string; // The '?' means this property is optional
}

export async function getTaskDifficulty(taskFinished: string) {
    try {
        const response = await fetch(`${OLLAMA_TUNNEL_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gamemaster",
                prompt: taskFinished,
                stream: false // We want the full answer at once, not word-by-word
            })
        });

        if (!response.ok) {
            throw new Error(`AI Server Error: ${response.status}`);
        }

        const data = await response.json();
        const aiResponseText = data.response; // e.g., "Score: 6\nReasoning: High Effort..."

        // Using regex to extract the number after "Score:" and the text after "Reasoning:" within the AI response
        const scoreMatch = aiResponseText.match(/Score:\s*(\d+)/i);
        const reasoningMatch = aiResponseText.match(/Reasoning:\s*(.+)/i);

        if (scoreMatch && reasoningMatch) {
            return {
                score: parseInt(scoreMatch[1], 10),
                reasoning: reasoningMatch[1].trim(),
                glitchScore: 0,
                AIExecuted: true
            };
        } else { // AI outputted improper format
            return {
                score: 0,
                reasoning: "The judge could not make a decision. A beam from the sky brightens you.",
                glitchScore: 3,
                AIExecuted: true,
                erroneousAIResponse: aiResponseText
            };
        }

    } catch (error) {
        console.error("Critical 'gamemaster' AI model Failure:", error);
        return {
            score: 0,
            reasoning: "Server connection lost. Practice your spells as the server connection restores.",
            glitchScore: 0,
            AIExecuted: false
        };
    }
}